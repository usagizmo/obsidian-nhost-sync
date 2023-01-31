# obsidian-nhost-sync

Sync note attachments under a specific Obsidian directory to Nhost's Database / Storage.

## Nhost DB settings

### public/notes

- **path**: File path from Vault root (pkey)
- **created_at**: Creation date - GraphQL Field Name: `createdAt`.
- **updated_at**: Modified date - GraphQL Field Name: `updatedAt` **basename**: The name of the file (pkey) from the Vault root.
- **basename**: filename without extension
- **extension**: File extension
- **name**: File name (duplicates allowed)
- **size**: file size
- **content?**: For MD notes, the content of the file
- **fileId?**: For attachment notes, the associated file ID

#### Permissions

- **admin**: `insert`, `select`, `update`, `delete`
- **public**: `select`

### storage/files (default)

- **id**: File ID as defined in Nhost
- **name**: File name (duplicates are allowed)
- **size**: file size
- **mimeType**: mimeType
- **created_at**: creation date - GraphQL Field Name: `createdAt` **updated_at**: file ID defined in Nhost
- **updated_at**: Modified date - GraphQL Field Name: `updatedAt` **created_at**: Created date - GraphQL Field Name: `createdAt
- ...

#### Permissions

- **admin**: `insert`, `select`, `update`, `delete`
- **public**: `select`
