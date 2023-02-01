# obsidian-nhost-sync

Sync notes & attachments under a specific Obsidian directory to Nhost's Database / Storage.

![nhost-sync-settings](https://user-images.githubusercontent.com/1271863/215930660-47d146a8-8786-40ba-ad54-7ffe0b3bead0.png)
![nhost-01](https://user-images.githubusercontent.com/1271863/215930648-82f1ea8f-1456-4d93-a6e5-3f67d323b245.png)
![nhost-02](https://user-images.githubusercontent.com/1271863/215930657-76b14f03-c61d-4a69-a289-ff97f34ff709.png)

## Install

ref. https://github.com/obsidianmd/obsidian-sample-plugin

## Nhost DB settings

### public/notes

- **path**: (text, primary key, unique) File path from Vault root
- **created_at**: (→ createdAt - timestamp with time zone, default: now())
- **updated_at**: (→ updatedAt - timestamp with time zone, default: now())
- **basename**: (text) filename without extension
- **extension**: (text) File extension
- **name**: (text) File name
- **size**: (integer) file size
- **content?**: (text, nullable) For .md notes, the content of the file
- **fileId?**: (text, nullable) For attachment notes, the associated `files.id`

#### Permissions

- **admin**: `insert`, `select`, `update`, `delete`
- **public**: `select`

### storage/files (default)

#### Permissions

- **admin**: `insert`, `select`, `update`, `delete`
- **public**: `select`
