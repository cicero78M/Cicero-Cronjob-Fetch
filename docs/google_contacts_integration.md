# Google Contacts Integration
*Last updated: 2025-08-15*

This guide explains how to configure and use the Google Contacts integration in **Cicero_V2**. The backend can create or look up contacts in a Google Workspace directory using the People API.

## Prerequisites
1. **Enable the People API** in your Google Cloud project.
2. **Create a service account** and enable **Domain-wide delegation**.
3. **Grant domain-wide delegation** in the Google Admin console:
   - Note the service account's client ID.
   - Under **Security → API controls → Domain-wide delegation**, add a new client with that client ID and the scope `https://www.googleapis.com/auth/contacts`.
4. **Provide credentials to the backend**:
   - Set `GOOGLE_SERVICE_ACCOUNT` to the JSON key content or path.
   - Set `GOOGLE_IMPERSONATE_EMAIL` to the Workspace user to impersonate.
   - Optionally override `GOOGLE_CONTACT_SCOPE` if a different scope is required.
   - Alternatively, place `credentials.json` and `token.json` in the project root for OAuth authentication. The `credentials.json` file must include a `redirect_uris` array.

## Usage
The service in `src/service/googleContactsService.js` exposes helpers for searching and saving contacts.

### Saving a New Contact
```javascript
import { authorize, saveGoogleContact } from './src/service/googleContactsService.js';

async function addContact() {
  const auth = await authorize();
  await saveGoogleContact(auth, { name: 'Jane Doe', phone: '628123456789' });
}
```

### Avoiding Duplicates
`saveGoogleContact` akan mengecek apakah nomor telepon sudah ada di Google Contacts sebelum menyimpan, sehingga tidak terjadi duplikasi. Untuk validasi tambahan terhadap tabel lokal, gunakan `saveContactIfNew(chatId)`:
```javascript
import { saveContactIfNew } from './src/service/googleContactsService.js';

await saveContactIfNew('628123456789@c.us');
```

## Testing the Integration
Run the following to ensure linting and tests pass:
```bash
npm run lint
npm test
```

## Tips
- The contact scope defaults to `https://www.googleapis.com/auth/contacts`.
- Set `CONTACT_AUTH_COOLDOWN_MS` (milliseconds) to throttle repeated auth attempts when credentials are missing or invalid.
- Keep credential files and environment variables secure.
- When using service account impersonation, ensure the impersonated user has permission to manage contacts.
