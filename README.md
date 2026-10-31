# Party disposable camera

A mobile-first website for one party. Each guest gets 24 photos in their browser. Photos are kept in private Supabase Storage until the reveal time, then the event link shows the shared gallery.

## What you need

- A Supabase account and project.
- Node.js installed on your computer.
- A GitHub account and a hosting account such as Vercel when you're ready to test on your phone.

## 1. Create your Supabase project

1. Sign in to Supabase and choose **New project**.
2. Choose an organization, enter a project name, create a strong database password, and select a region. Save the database password somewhere safe; the app does not use it.
3. Wait for the project to finish setting up.

## 2. Turn on anonymous guest sessions

1. Open your project in the Supabase dashboard.
2. Go to **Authentication** and find **Sign In / Providers** (the exact menu label may vary).
3. Enable **Anonymous Sign-Ins** and save.

Guests will not need to register or enter an email. Their anonymous session is saved in their browser.

## 3. Create the database and private photo bucket

1. In this repository, open `supabase/schema.sql`.
2. The event is currently configured for **1 November 2026 at 3:00 pm Europe/Berlin**. The SQL timestamp is `2026-11-01 15:00:00+01` because Berlin is on UTC+01 in November. If you need a different time, edit that timestamp before running the SQL.
3. In the Supabase dashboard, go to **SQL Editor** and choose **New query**.
4. Copy all of `supabase/schema.sql` into the query editor and select **Run**.
5. Check that the query completes without an error. It creates the event, photos table, access policies, and a private `party-photos` storage bucket. You do not need to create the bucket separately.

You can run this SQL again after changing the event time; the seed statement updates the existing `party` event.

## 4. Add your local Supabase settings

`.env.example` is already included as a template. Do not put real project credentials in that template.

1. From the repository folder, open PowerShell or the VS Code terminal.
2. Copy the template to a local environment file:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. In the Supabase dashboard, open **Project Settings → API** (sometimes shown as **API Settings**). Copy the **Project URL** and the **anon/public** or **publishable** client key.
4. Open `.env.local` and replace the example values:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```

   Use the client-side anon/publishable key only. **Never** put the `service_role` or secret key in this file or in the website.

`.env.local` is ignored by Git, so it should not be pushed to GitHub.

## 5. Run the website on your computer

In the terminal, from the repository folder:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). You should see the countdown and camera page. On your computer, the photo button may open a file chooser instead of a camera; that is normal.

To confirm the production version builds:

```powershell
npm run build
```

## 6. Deploy it so you can test on your phone

A hosted HTTPS website is the easiest way to test the camera on a phone and share the party link.

1. Create a GitHub repository and push this project to it. Do not add or push `.env.local`.
2. In Vercel, choose **Add New → Project**, import the GitHub repository, and deploy it. Vercel should detect Vite automatically. The build command is `npm run build`; the output directory is `dist`.
3. In Vercel's project settings, add these environment variables for the deployment:
   - `VITE_SUPABASE_URL` — your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon/publishable client key.
4. Redeploy after adding or changing environment variables. Vite reads them when it builds.
5. Open the Vercel HTTPS URL on your phone. Allow camera access if asked, take a test photo, and check that the shot counter drops by one.

If you change an environment variable or the event time, redeploy the website after making the change. If you change the event timestamp in SQL, the database immediately uses the new time for access rules.

## 7. Test the reveal safely

Do not move the real party's reveal time forward just to test: once it is revealed, the shared gallery is intentionally public to anyone with the event link, and the event stops accepting new photos.

For an end-to-end reveal test, create a **separate Supabase test project**, enable anonymous sign-ins, and run the same `supabase/schema.sql` there. Point a Vercel Preview deployment at that test project's URL and key using Vercel's **Preview** environment variables. Set only the test project's event to reveal in a few minutes:

```sql
update public.events
set reveal_at = now() + interval '5 minutes'
where id = 'party';
```

Open that preview link on your phone, take a photo, wait for the countdown, and reload the page to see the gallery. The real project and its November 1 reveal time remain unchanged.

## Important behavior

- The photo bucket must remain private. The SQL sets it up that way.
- The database enforces the 24-photo limit per anonymous guest session.
- Guest identity is browser-based, not a phone hardware ID. Clearing browser data or switching devices can create a new guest identity.
- Anyone with the event link can open the gallery after reveal.
- After reveal, guests can tap a photo to view it, or select multiple photos and save them using the device's share sheet when supported. Photo files prepare after the first tap; a second tap opens the share sheet, which may offer a **Save Image** or **Save to Photos** option. Browsers do not provide a direct camera-roll permission prompt or a universal camera-roll API. If file sharing is unsupported, the page explains how to open it in a compatible mobile browser instead of starting downloads.
- The Supabase project URL and anon/publishable key are intended for the website. Never expose a Supabase `service_role` or secret key.
- The visual styles and theme variables are in `src/styles.css`; event/photo operations are in `src/lib/party.ts`; Supabase rules and event time are in `supabase/schema.sql`.
- To add the design's sample party photo, put a JPEG named `IMG_7897.jpg` in `public/photos/`. The page uses it as a preview; it is separate from guests' private Supabase uploads.
