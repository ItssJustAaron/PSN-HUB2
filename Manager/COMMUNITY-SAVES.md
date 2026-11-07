# Community Saves pilot

Start the private library on your PC with Node.js using `node tools/community-saves.cjs`. Configure these environment variables first.

| Variable | Purpose |
| --- | --- |
| `PSNHUB_COMMUNITY_DATA` | Private directory for packages and review status. Keep it outside public hosting and version control. |
| `PSNHUB_COMMUNITY_CODE` | Random member code, 24–128 printable characters without spaces. |
| `PSNHUB_COMMUNITY_ADMIN` | Separate random reviewer code with the same length requirements. |
| `PSNHUB_COMMUNITY_ORIGINS` | Comma-separated Manager origins allowed to connect, including scheme and port. |
| `PSNHUB_COMMUNITY_HOST` | Bind address. Defaults to loopback. Use the PC's LAN address for a private network test. |
| `PSNHUB_COMMUNITY_PORT` | Listening port. Defaults to 8095. |

Open **Community Saves** in the Manager, enter the library origin and member code, then refresh. Submit an encrypted PS5 save image or a PS4 save image with its 96-byte companion key. Submissions stay private until a reviewer signs in with the separate code and approves them. Reviewers can download the package for inspection or withdraw an approved listing.

For a save downloaded as a ZIP from the Saves tab, extract the encrypted image and, for PS4, its matching key before submitting.

To install an approved save, choose **Install & resign**, select a console user in Save Tools, and prepare the import. The engine checks the staged title against the listing. The Manager requires a successful backup before replacing an existing save. The final install uses the save engine to assign ownership to the selected console user.

Start the integrated save engine if prompted. Keep the target game closed during import. Game names and icons come from console metadata when available, with catalogue and title ID fallbacks. Community listings use the catalogue.

The pilot accepts 40 packages up to 256 MiB each. An operator can remove unwanted entries by stopping the service and deleting their corresponding UUID directories. LAN HTTP is unencrypted. Use an HTTPS endpoint for access beyond a trusted LAN.
