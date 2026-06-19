# R and A Dental Supply Center Co. — Repair Ticket Tracker (Web App)

A multi-user web app for logging device repairs, warranty status, and service history. Each employee signs in with their own account. Data is shared and synced for everyone — accessible from any browser, on any computer or phone, once deployed.

This guide gets it live on the internet for free, with no coding required. It takes about 15–20 minutes. You'll create two free accounts (a database host and a web host) — I can't create these for you, but every click is listed below.

## What you're deploying

- **Neon** — free hosted Postgres database (where ticket and employee data lives)
- **Render** — free hosted web server (runs the app and serves it at a public URL)
- **GitHub** — free file storage Render deploys from (you upload the project files once)

## Step 1 — Create a free database on Neon

1. Go to **neon.tech** and click **Sign up** (you can use your Google account — no credit card required).
2. Once in, click **Create a project**. Name it `ra-dental-crm` and keep the default region.
3. After it's created, go to the project's **Dashboard** and find the **Connection String** (sometimes labeled "Connection Details"). It looks like:
   `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`
4. Copy this entire string — you'll paste it into Render in Step 3. Keep this tab open.

## Step 2 — Upload the project to GitHub

1. Go to **github.com** and sign in or sign up (free).
2. Click the **+** icon (top right) → **New repository**. Name it `ra-dental-crm`, set it to **Private**, and click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Open the `ra-dental-crm-webapp` folder I've delivered, select **all files and folders inside it** (not the folder itself), and drag them into the GitHub upload box.
5. Scroll down and click **Commit changes**.

   You do not need to install Git or use any command line for this.

## Step 3 — Deploy on Render

1. Go to **render.com** and sign up (free — you can use GitHub to sign in, which also connects your repo automatically).
2. Click **New +** → **Blueprint**.
3. Connect your `ra-dental-crm` GitHub repo when prompted. Render will detect the `render.yaml` file included in the project and pre-fill the setup.
4. You'll be asked to fill in a couple of values:
   - **DATABASE_URL** → paste the Neon connection string from Step 1.
   - **ADMIN_PASSWORD** → choose a strong password for the first admin login (write it down).
5. Click **Apply** / **Create**. Render will install everything and start the app — this takes a few minutes the first time.
6. When it's done, Render shows your live URL, something like:
   `https://ra-dental-repair-crm.onrender.com`

That URL is what you'll share with your employees.

## Step 4 — First login and adding employees

1. Open your `*.onrender.com` URL.
2. Sign in with:
   - Username: `admin`
   - Password: the `ADMIN_PASSWORD` you set in Step 3
3. Click **Change Password** in the top right and set a new one only you know.
4. Go to the **Employees** tab (visible only to admins) → **+ Add Employee**. Give each staff member a username and temporary password — they should change it after their first login.
5. Repeat for every employee who needs access. Set their role to **Admin** only if they should manage other accounts or delete tickets.

Employees just need the URL plus their username and password — no installation needed, works on any phone, tablet, or computer browser.

## Good to know

- **Free tier sleep**: Render's free plan puts the app to sleep after ~15 minutes of no traffic. The next visit takes 30–60 seconds to wake up, then runs normally. If that delay is a problem, Render's paid "Starter" tier (a few dollars/month) keeps it always-on — upgrade only if you decide you want that.
- **Backups**: Neon's free tier retains your data reliably, but for extra safety you can periodically use the **Export CSV** button in the app to keep your own backup copy.
- **Updating later**: if you ever want changes to the app, send me the request and I'll give you updated files to re-upload to the same GitHub repo — Render redeploys automatically when the repo changes.
- **Costs**: both Neon and Render's free tiers require no credit card to start. If your team grows or you want always-on hosting, paid tiers are optional upgrades you control.

## Troubleshooting

- **"Application failed to respond" on Render**: check the Render service's **Logs** tab — it usually means `DATABASE_URL` wasn't pasted correctly.
- **Can't log in as admin**: double-check the `ADMIN_PASSWORD` value you set in Render's environment variables (Render → your service → **Environment**).
- **Forgot an employee's password**: any admin can reset it from the **Employees** tab → **Edit** → enter a new password.
