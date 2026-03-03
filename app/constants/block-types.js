/**
 * Supported block types for schedulable entities.
 * Each type has a unique key, display label, and schema for type_config.
 */
export const BLOCK_TYPES = {
  hero: {
    key: "hero",
    label: "Hero Banner",
    description: "Full-width promotional banner with desktop/mobile images, headline, and CTA",
    fields: [
      { key: "headline", type: "text", label: "Headline", required: false },
      { key: "description", type: "text", label: "Description", required: false, multiline: true },
      { key: "desktop_banner", type: "media", label: "Desktop Banner", required: false },
      { key: "mobile_banner", type: "media", label: "Mobile Banner", required: false },
      { key: "target_url", type: "url", label: "Target URL", required: false },
      { key: "button_text", type: "text", label: "Button Text", required: false },
    ],
  },
  announcement_bar: {
    key: "announcement_bar",
    label: "Announcement Bar",
    description: "Compact bar for announcements, promos, or notices",
    fields: [
      { key: "text", type: "text", label: "Message", required: true },
      { key: "link", type: "url", label: "Link URL", required: false },
      { key: "bg_color", type: "color", label: "Background Color", default: "#000000" },
      { key: "text_color", type: "color", label: "Text Color", default: "#ffffff" },
    ],
  },
  collection_banner: {
    key: "collection_banner",
    label: "Collection Banner",
    description: "Banner featuring a collection with image, title, and link",
    fields: [
      { key: "collection_handle", type: "text", label: "Collection Handle", required: false },
      { key: "use_closest_collection", type: "checkbox", label: "Use current collection (dynamic on collection pages)", required: false },
      { key: "image", type: "media", label: "Banner Image (optional override)", required: false },
      { key: "headline", type: "text", label: "Headline Override", required: false },
      { key: "description", type: "text", label: "Description", required: false, multiline: true },
      { key: "button_text", type: "text", label: "Button Text", required: false },
    ],
  },
  countdown_banner: {
    key: "countdown_banner",
    label: "Countdown Banner",
    description: "Countdown timer to a target date for sales or events",
    fields: [
      { key: "target_date", type: "datetime", label: "Target Date & Time", required: true },
      { key: "headline", type: "text", label: "Headline", required: false },
      { key: "subtext", type: "text", label: "Subtext", required: false },
      { key: "background_image", type: "media", label: "Background Image", required: false },
      { key: "background_color", type: "color", label: "Background Color", default: "#000000" },
      { key: "text_color", type: "color", label: "Text Color", default: "#ffffff" },
      { key: "target_url", type: "url", label: "Link URL", required: false },
      { key: "button_text", type: "text", label: "Button Text", required: false },
    ],
  },
  image_with_text: {
    key: "image_with_text",
    label: "Image with Text",
    description: "Side-by-side or stacked image with text block",
    fields: [
      { key: "image", type: "media", label: "Image", required: true },
      { key: "headline", type: "text", label: "Headline", required: false },
      { key: "description", type: "text", label: "Description", required: false, multiline: true },
      { key: "button_text", type: "text", label: "Button Text", required: false },
      { key: "button_link", type: "url", label: "Button Link", required: false },
      { key: "layout", type: "select", label: "Layout", options: ["image_left", "image_right"], default: "image_left" },
    ],
  },
  background_video: {
    key: "background_video",
    label: "Background Video",
    description: "Video background with overlay text (hosted URL or Shopify Files)",
    fields: [
      { key: "video_url", type: "url", label: "Video URL (hosted)", required: false },
      { key: "video_file", type: "media", label: "Video from Shopify (optional)", required: false },
      { key: "headline", type: "text", label: "Headline", required: false },
      { key: "description", type: "text", label: "Description", required: false, multiline: true },
      { key: "button_text", type: "text", label: "Button Text", required: false },
      { key: "button_link", type: "url", label: "Button Link", required: false },
      { key: "overlay_opacity", type: "number", label: "Overlay Opacity (0-100)", default: 50 },
    ],
  },
  promo_card: {
    key: "promo_card",
    label: "Promo Card",
    description: "Compact promotional card with image and CTA",
    fields: [
      { key: "image", type: "media", label: "Image", required: true },
      { key: "title", type: "text", label: "Title", required: false },
      { key: "description", type: "text", label: "Description", required: false, multiline: true },
      { key: "cta_url", type: "url", label: "CTA Link", required: false },
      { key: "cta_text", type: "text", label: "CTA Text", required: false },
    ],
  },
};

export const DEFAULT_BLOCK_TYPE = "hero";

export const getBlockType = (key) => BLOCK_TYPES[key] ?? BLOCK_TYPES[DEFAULT_BLOCK_TYPE];
