# Theme Stream Theme Block

This theme app extension renders a single scheduled banner selected from Theme Stream metaobjects. Merchants can control layout and styling via theme settings.

## Recommended image sizes

Use these dimensions for best results across devices:

| Block type | Desktop | Mobile | Notes |
|------------|---------|--------|-------|
| Hero Banner | 1920×1080 or 2400×1200 | 750×1000 | 16:9 or 2:1 for full-width; mobile crops to fit |
| Image with Text | 800×800 | 600×600 | Square works well for side-by-side layout |
| Promo Card | 600×400 | 400×300 | Landscape; card crops to fit |
| Collection Banner | 1200×600 | 600×400 | Banner-style; collection image override |
| Countdown Banner | 1920×600 | 750×400 | Wide banner with overlay text |
| Background Video | 1920×1080 | 1280×720 | MP4, keep file size under 5MB for performance |

**General tips:** Use WebP or optimized JPEG. Avoid images smaller than 600px on the shortest side for hero/banner blocks. The block uses `object-fit` to scale; images are not stretched.

## Responsive behavior

- **Breakpoint** – Content switches to mobile layout below the Breakpoint (default `768px`). Headlines, descriptions, and buttons move below the image on mobile when *Show content below banner on mobile* is enabled.
- **Image height** – `adapt_to_image` preserves aspect ratio; `small`, `medium`, `large`, `full_screen` set fixed heights. Mobile height can differ from desktop.
- **Image with Text** – On desktop, the gap between image and text is taken from the text column. On mobile, layout stacks vertically.
- **Text alignment** – Desktop and mobile alignment can be set independently.

## Configuration tips

- **Overlay colour & opacity** – the `Overlay colour` and `Overlay opacity` settings drive a CSS gradient rendered by the block. No additional filters are required; the block publishes CSS variables that power the overlay.
- **Mobile layout** – toggling *Show content below banner on mobile* moves the button/text out of the overlay and into a separate section for readability.
- **Breakpoint** – the `Breakpoint` setting controls when the mobile layout activates (default `768px`).
- **Typography** – headline, description, and button fonts inherit the selected typography settings; ensure custom fonts are available via the theme.

## Developer notes

- The block reads metaobjects with type `theme_stream_schedulable_entity`. Ensure the app has created the definition and assigned entries before adding the block to a theme.
- All overlay logic now lives in CSS (`theme-stream__banner-content::before`), so there are no Liquid filters that depend on Shopify-specific helpers.
- Run `shopify extension serve --directory=extensions/theme-stream` during development and `shopify extension deploy ...` when ready for production.
