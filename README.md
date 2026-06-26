# userscripts

Browser userscripts for various sites.

Click a script name below to install it in your userscript manager (ScriptCat, Tampermonkey, Violentmonkey, etc.).

## Scripts

### [SLR Download Preview GIF](https://raw.githubusercontent.com/whatamihere-4/userscripts/main/sexlikereal-download-preview-gif.user.js)

Adds a **Download preview GIF** button on [SexLikeReal](https://www.sexlikereal.com/) scene pages. Fetches the 300p preview MP4 from the CDN, converts it to a 24 fps GIF at full resolution (500×300) using palette optimization ([gifenc](https://www.npmjs.com/package/gifenc) via CDN), and saves `{sceneId}-preview.gif`.

- **Match:** `*://*.sexlikereal.com/scenes/*`
- **Requires:** access to `cdn-vr.sexlikereal.com`
