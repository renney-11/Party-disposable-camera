import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export const EVENT_ID = 'party';
export const PHOTO_LIMIT = 24;
export const PHOTO_BUCKET = 'party-photos';

export type PartyEvent = {
  id: string;
  name: string;
  reveal_at: string;
};

export type GalleryPhoto = {
  id: string;
  signedUrl: string;
  storagePath: string;
  createdAt: string;
};

export async function joinParty(): Promise<{ user: User; event: PartyEvent; remaining: number }> {
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  let user = sessionData.session?.user;
  if (!user) {
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError) throw authError;
    if (!authData.user) throw new Error('Could not start a guest session.');
    user = authData.user;
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, reveal_at')
    .eq('id', EVENT_ID)
    .single();
  if (eventError) throw eventError;

  const { count, error: countError } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', EVENT_ID)
    .eq('user_id', user.id);
  if (countError) throw countError;

  return {
    user,
    event,
    remaining: Math.max(0, PHOTO_LIMIT - (count ?? 0)),
  };
}

export async function takePhoto(file: File, eventId: string, userId: string): Promise<number> {
  const supabase = getSupabase();
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const path = `${eventId}/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error: saveError } = await supabase.rpc('save_party_photo', {
    photo_event_id: eventId,
    photo_storage_path: path,
  });

  if (saveError) {
    const { error: cleanupError } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (cleanupError) {
      throw new Error(`${saveError.message} The uploaded file could not be cleaned up: ${cleanupError.message}`);
    }
    throw saveError;
  }

  if (typeof data !== 'number') {
    throw new Error('The photo was saved, but your remaining shots could not be confirmed. Reload the page.');
  }

  return data;
}

export async function loadGallery(eventId: string): Promise<GalleryPhoto[]> {
  const supabase = getSupabase();
  const { data: photos, error: photosError } = await supabase
    .from('photos')
    .select('id, storage_path, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (photosError) throw photosError;

  const gallery = await Promise.all(
    (photos ?? []).map(async (photo) => {
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(photo.storage_path, 60 * 60);
      if (error) throw error;
      return {
        id: photo.id,
        signedUrl: data.signedUrl,
        storagePath: photo.storage_path,
        createdAt: photo.created_at,
      };
    }),
  );

  return gallery;
}

export async function createPhotoDownloadUrl(photo: GalleryPhoto, fileName: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photo.storagePath, 60 * 60, { download: fileName });
  if (error) throw error;
  return data.signedUrl;
}
