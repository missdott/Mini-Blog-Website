# NOOK | Mini Blog & Social Media Platform

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js:** Version 18.x or higher is recommended for Next.js 16.
- **Package Manager:** npm (comes with Node.js).
- **Firebase Account:** Access to a Firebase project with Firestore and Auth enabled.
- **Cloudinary Account:** A free-tier account for image hosting.

### Installation

1. **Clone the repository:** Open your terminal and run:

   ```bash
   git clone https://github.com/your-username/nook-blog-platform.git
   ```

2. **Navigate to the project directory:**

   ```bash
   cd nook-blog-platform
   ```

3. **Install dependencies:** Fetch all necessary packages listed in `package.json`:

   ```bash
   npm install
   ```

4. **Set Up Environment Variables:** This project uses a `.env.local` file for Firebase configuration. Create this file in the root directory and fill in the values from your Firebase Console:

   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

   > **Note:** Cloudinary credentials (Cloud Name and Unsigned Upload Preset) are managed in `src/lib/imageUtils.ts`.

### Running the App

1. **Start the development server:** Use Turbopack for a faster development experience:

   ```bash
   npm run dev
   ```

2. **Access the application:** Open your browser and navigate to `http://localhost:3000`.

### Troubleshooting

If you encounter issues during setup or development:

- **Clear Build Cache:** If the UI isn't updating correctly or you encounter strange build errors, try clearing the Next.js cache:

  ```bash
  rm -rf .next
  ```

- **Firebase Rules:** Ensure your Firestore security rules and composite indexes are deployed if you encounter permission or query errors:

  ```bash
  firebase deploy --only firestore:rules
  firebase deploy --only firestore:indexes
  ```

- **Image Uploads:** Verify that your Cloudinary upload preset is set to `"unsigned"` and matches the `UPLOAD_PRESET` string in `imageUtils.ts`.