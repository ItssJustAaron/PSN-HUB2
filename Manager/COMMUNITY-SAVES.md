# Community Saves

Manager uses the public GitHub library by default. Choose **Upload a save**, select an encrypted console save or PC files, and choose **Prepare ZIP for GitHub**. Download the ZIP and attach it to the GitHub submission form. Submitting requires a GitHub account, a title ID, a description, and consent to public sharing. GitHub limits attachments to 25 MB. [Upload form](https://github.com/ItssJustAaron/PSN-HUB-Saves/issues/new?template=save.yml)

Once GitHub processes the submission, refresh the library in Manager. Choose **Install & resign**, select the receiving console user, and confirm the staged import. Downloads are also available from the submission issue. [Browse saves](https://github.com/ItssJustAaron/PSN-HUB-Saves/issues)

## Optional hosted library

Start the library with Node.js using `node tools/community-saves.cjs`. For internet access, run it on a host with persistent storage and a public HTTPS endpoint. The server's homepage offers uploads and downloads. In PSN-HUB Manager, enter the same endpoint under **Community Saves** to prepare approved saves for installation.

The repository includes a Render Blueprint for a Starter web service with a persistent disk. Set the GitHub token in the host's secret settings. Once the service is reachable, set `libraryOrigin` in `Manager/community-saves-config.json` to its public HTTPS origin. Manager will open that library automatically. Keep this setting empty until the public endpoint is ready.

| Variable | Purpose |
| --- | --- |
| `PSNHUB_COMMUNITY_DATA` | Private directory for packages and review status. Keep it outside public hosting and version control. |
| `PSNHUB_COMMUNITY_ADMIN` | Random reviewer code, 24–128 printable characters without spaces. |
| `PSNHUB_COMMUNITY_ORIGINS` | Comma-separated origins allowed to use the reviewer code, including the public site's origin if reviewing there. Public browsing and submissions are available from any origin. |
| `PSNHUB_COMMUNITY_HOST` | Bind address. Defaults to loopback. Use the PC's LAN address for a private network test. |
| `PSNHUB_COMMUNITY_PORT` | Listening port. Defaults to 8095. |

Anyone can browse published saves and submit an encrypted PS5 save image or a PS4 save image with its 96-byte companion key. Every new submission requires a one-line description of 1–240 characters and consent to share publicly. New uploads publish automatically. Administrators can withdraw a listing or retry a failed publication.

Set `PSNHUB_GITHUB_TOKEN` on the Community Saves server to publish new uploads to GitHub. Use a fine-grained GitHub token restricted to `PSN-HUB-Saves` with **Contents: Read and write**. The server creates a release with the description, encrypted image, and PS4 key when applicable. Withdrawal removes the corresponding release. Without a token, uploads publish to the local library. Existing pending submissions keep their previous status. [Browse published saves](https://github.com/ItssJustAaron/PSN-HUB-Saves/releases)

In Manager, choose **Upload a save → Choose a save on this PS5 → Load console saves** to select a game and save file. Close the game first. You can also select encrypted files on your PC using the upload form.

Use a fresh data directory when opening a former private pilot to the public. Only bring over submissions whose authors agreed to public sharing.

For a save downloaded as a ZIP from the Saves tab, extract the encrypted image and, for PS4, its matching key before submitting.

To install an approved save, choose **Install & resign**, select a console user in Save Tools, and prepare the import. The engine checks the staged title against the listing. The Manager requires a successful backup before replacing an existing save. The final install uses the save engine to assign ownership to the selected console user.

Start the integrated save engine if prompted. Keep the target game closed during import. Game names and icons come from console metadata when available, with catalogue and title ID fallbacks. Community listings use the catalogue.

The library accepts 40 packages up to 256 MiB each. An operator can remove unwanted entries by stopping the service and deleting their corresponding UUID directories. LAN HTTP is unencrypted. Use an HTTPS endpoint for access beyond a trusted LAN.
