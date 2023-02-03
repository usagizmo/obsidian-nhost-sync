# obsidian-nhost-sync

Sync notes & attachments under a specific Obsidian directory to Nhost's Database / Storage.

\[DEMO (ja)\]: https://usagizmo.com/notes/obsidian-nhost-sync

![nhost-sync-settings](https://user-images.githubusercontent.com/1271863/216643065-6e6461cf-51ec-44ff-9c8d-47b6758d8480.png)
![nhost-01](https://user-images.githubusercontent.com/1271863/215930648-82f1ea8f-1456-4d93-a6e5-3f67d323b245.png)
![nhost-02](https://user-images.githubusercontent.com/1271863/215930657-76b14f03-c61d-4a69-a289-ff97f34ff709.png)

## Install

ref. https://github.com/obsidianmd/obsidian-sample-plugin

## Nhost DB settings

### `public/notes` (create new)

#### Columns

- **path**: (text, primary key, unique) File path from Vault root
- **created_at**: (→ createdAt - timestamp with time zone, default: now())
- **updated_at**: (→ updatedAt - timestamp with time zone, default: now())
- **basename**: (text) File name without extension
- **extension**: (text) extension
- **name**: (text) filename
- **size**: (integer) file size
- **content?**: (text, nullable) For `.md` note, the content of the file
- **fileId?**: (text, nullable) For attachment note, this is associated with `files.id`

#### Permissions

- **admin**: `insert`, `select`, `update`, `delete`
- **public**: `select`

### `storage/files` (existing)

#### Permissions

- **admin**: `insert`, `select`, `update`, `delete`
- **public**: `select`
