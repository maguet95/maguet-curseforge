# Maguet — how we handle CurseForge files

**Maguet** is a Minecraft (Java Edition) launcher and a creator tool, **Maguet Studio**, built for modpack
communities. A community owner builds and publishes their modpack in Studio. Their players install it and keep it up
to date with one click, and owners get a ready-to-upload package for their game server.

Website: [maguetcorp.com](https://maguetcorp.com) · Launcher: [mc.maguetcorp.com](https://mc.maguetcorp.com) ·
Contact: [enmanuel@maguetcorp.com](mailto:enmanuel@maguetcorp.com)

This repository publishes, **unchanged**, the parts of Maguet that deal with files hosted on CurseForge, so that
CurseForge, mod authors and anyone else can check exactly how we treat them. The rest of the launcher is closed
source. Code comments are in Spanish, the project's working language.

## Our rules for CurseForge files

1. **Our tools don't upload CurseForge files.** When a modpack includes a file from CurseForge (a mod, resource
   pack, shader or data pack), Maguet Studio links it to its official CurseForge page instead of uploading it.
   Packages that Maguet builds from a published modpack never include CurseForge files; those are always fetched from
   their CurseForge page. Maguet's file storage (`archivos.maguetcorp.com`) accepts only creators' configuration files
   and branding images.
2. **Every CurseForge file comes from CurseForge**, through its official page. A person opens the page and presses
   **Download** on CurseForge's own site, with CurseForge's own ads, as the mod author intended.
3. **We do not automate that click.** Our tools do not bypass the page, start downloads by themselves or scrape
   download links.
4. **We verify every file by its hash** (MD5) against the exact file the modpack creator chose. A file that doesn't
   match is never used.
5. **Modrinth first.** When the very same file is also published on Modrinth, identified by its hash, we use
   Modrinth's CDN, which allows direct downloads. CurseForge's page is used only for files that live only there.

Once we have access to the CurseForge API, files whose authors allow third-party distribution will be downloaded
through the API, from CurseForge's CDN and attributed to their authors. Files whose authors don't allow it will keep
the flow above.

## What's in this repository

| Folder | File | What it does |
|---|---|---|
| `launcher/` | `descargamanual.js` | Lists the CurseForge files a modpack still needs. It explains to the player why they are downloaded from CurseForge's page, watches the player's Downloads folder, checks each file's hash and puts it in place. |
| `launcher/` | `ventanacurseforge.js` | Opens the official CurseForge **file page** (`…/files/<id>`) in a sandboxed launcher window: no Node.js, its own session, and navigation limited to `curseforge.com` and its CDN. The player presses **Download**; the window catches that download, hands it over for the hash check, and closes. |
| `studio/` | `fuentes-mods.js` | Classifies each mod of a published modpack as Modrinth, CurseForge or creator-hosted. CurseForge entries keep only their official page and hash, never a download URL. |
| `server-package/` | `descargar-mods.ps1`, `descargar-mods.bat` | The "STEP 1" script of the server package. It downloads Modrinth and creator-hosted files, checking each one's hash. For CurseForge files, it opens their official page, explains why, waits for the person to press **Download**, and moves the file from Downloads into the server's `mods` folder after checking its hash. |

This is the same approach other launchers take with files whose authors don't allow distribution. For example,
Prism Launcher lists them, links to their CurseForge pages and picks them up from the Downloads folder.

## License

Copyright © 2026 Maguet. **All rights reserved.** This code is published so it can be read and reviewed. It is not
licensed for reuse, modification or redistribution. See [LICENSE](LICENSE).
