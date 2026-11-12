import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

export const EVENT_ID = 'saxon-trip';
export const PHOTO_LIMIT = 24;
const partyApiUrl = import.meta.env.VITE_PARTY_API_URL?.replace(/\/$/, '');
export const isPartyApiConfigured = Boolean(partyApiUrl);

export type PartyEvent = {
  id: string;
  name: string;
  reveal_at: string;
};

export type GalleryPhoto = {
  id: string;
  signedUrl: string;
  thumbnailUrl: string;
  storagePath: string;
  createdAt: string;
};

type PartyResponse = {
  event: PartyEvent;
  remaining: number;
};

async function getAccessToken(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error('Your guest session has expired. Reload the page.');
  }
  return data.session.access_token;
}

async function requestApi<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  if (!partyApiUrl) {
    throw new Error('The Saxon trip API is not configured.');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${partyApiUrl}${path}`, { ...init, headers });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`The Saxon trip API returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `The Saxon trip API request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

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

  const { data: activeSession, error: activeSessionError } =
    await supabase.auth.getSession();
  if (activeSessionError) throw activeSessionError;
  const token = activeSession.session?.access_token;
  if (!token) throw new Error('Could not start a guest session.');
  const result = await requestApi<PartyResponse>('/api/party', token);

  return {
    user,
    event: result.event,
    remaining: result.remaining,
  };
}

export async function takePhoto(
  file: File,
  thumbnail: File,
  eventId: string,
): Promise<number> {
  const token = await getAccessToken();
  const form = new FormData();
  form.set('eventId', eventId);
  form.set('photo', file);
  form.set('thumbnail', thumbnail);
  const result = await requestApi<{ remaining: number }>('/api/photos', token, {
    method: 'POST',
    body: form,
  });
  return result.remaining;
}

export async function loadGallery(eventId: string): Promise<GalleryPhoto[]> {
  if (eventId !== EVENT_ID) throw new Error('Unknown event.');
  const token = await getAccessToken();
  return requestApi<GalleryPhoto[]>('/api/photos', token);
}

export async function createPhotoDownloadUrl(photo: GalleryPhoto): Promise<string> {
  const token = await getAccessToken();
  const result = await requestApi<{ signedUrl: string }>('/api/photos/sign', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath: photo.storagePath }),
  });
  return result.signedUrl;
}
