const HEIGHT_MAP = {
  adapt_to_image: null,   // exact proportions, width 100%, height from aspect ratio
  adapt_to_width: null,   // backward compat
  small: { desktop: 200, mobile: 180 },
  medium: { desktop: 320, mobile: 280 },
  large: { desktop: 480, mobile: 360 },
  full_screen: "100vh",
};

/**
 * Live preview of scheduled block types as they would appear on the storefront.
 * Renders a simplified version of each block type for the Create/Edit modals.
 * Supports image height (adapt/small/medium/large/full_screen), fit (contain/cover/fill/none), button and text styling.
 */
export default function BlockPreview({ blockType, data = {}, mediaFiles = [], videoFiles = [], variant = "inline", viewport = "desktop" }) {
  const resolveUrl = (id) => {
    if (!id) return null;
    const file = mediaFiles.find((f) => f.id === id) || videoFiles.find((f) => f.id === id);
    return file?.url || null;
  };

  const isMobile = viewport === "mobile";
  const heroImgId = isMobile ? (data.mobile_banner || data.desktop_banner) : (data.desktop_banner || data.mobile_banner);
  const heroImgUrl = resolveUrl(heroImgId);
  const imgUrl = resolveUrl(data.desktop_banner || data.mobile_banner || data.image || data.collection_banner_image || data.countdown_bg_image || data.image_with_text_image || data.promo_card_image);
  const videoUrl = data.video_url || resolveUrl(data.video_file);

  const imgHeightKey = (data.image_height || "adapt_to_image").trim() || "adapt_to_image";
  const imgHeightMobileKey = (data.image_height_mobile || "adapt_to_image").trim() || "adapt_to_image";
  const heightSpec = isMobile ? HEIGHT_MAP[imgHeightMobileKey] : HEIGHT_MAP[imgHeightKey];
  const bannerMinHeight = heightSpec === null ? undefined : (typeof heightSpec === "string" ? heightSpec : (isMobile ? heightSpec.mobile : heightSpec.desktop));
  const isAdaptToImage = heightSpec === null;

  const imgFit = (isMobile ? (data.image_fit_mobile || data.image_fit) : (data.image_fit || data.image_fit_mobile)) || "cover";
  const btnBg = data.button_bg_color || "#ffffff";
  const btnColor = data.button_text_color || "#667eea";
  const btnRadius = data.button_border_radius != null && data.button_border_radius !== "" ? `${Number(data.button_border_radius) || 6}px` : "6px";
  const legacyPad = data.button_padding != null && data.button_padding !== "" ? String(data.button_padding).trim().split(/\s+/) : [];
  const padV = data.button_padding_vertical != null && data.button_padding_vertical !== "" ? Number(data.button_padding_vertical) : (legacyPad[0] != null ? Number(legacyPad[0]) : 12);
  const padH = data.button_padding_horizontal != null && data.button_padding_horizontal !== "" ? Number(data.button_padding_horizontal) : (legacyPad[1] != null ? Number(legacyPad[1]) : legacyPad[0] != null ? Number(legacyPad[0]) : 24);
  const btnPadding = `${padV}px ${padH}px`;
  const btnFontSize = data.button_font_size != null && data.button_font_size !== "" ? `${Number(data.button_font_size)}em` : "0.875rem";
  const headSize = data.headline_font_size != null && data.headline_font_size !== "" ? `${Number(data.headline_font_size)}em` : "1rem";
  const descSize = data.description_font_size != null && data.description_font_size !== "" ? `${Number(data.description_font_size)}em` : "0.8rem";
  const headColor = data.headline_color || "#ffffff";
  const descColor = data.description_color || "rgba(255,255,255,0.9)";
  const textAlign = data.text_alignment || "left";
  const overlayDefault = blockType === "countdown_banner" ? 0.3 : blockType === "background_video" ? 0.5 : 0.7;
  const overlayOpacity = data.overlay_opacity != null && data.overlay_opacity !== "" ? Number(data.overlay_opacity) / 100 : overlayDefault;
  const overlayColor = data.overlay_color || "#000000";
  const hexToRgb = (h) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
    return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : "0,0,0";
  };
  const overlayGradient = overlayOpacity > 0 ? `linear-gradient(to top, rgba(${hexToRgb(overlayColor)},${overlayOpacity}), transparent)` : "none";

  const previewStyles = {
    container: {
      ...(variant === "pane" ? { marginTop: 0, padding: 0, backgroundColor: "transparent", borderRadius: 0, border: "none" } : { marginTop: "1rem", padding: "1rem", backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #e1e3e5" }),
    },
    label: {
      fontSize: "0.75rem",
      fontWeight: 600,
      color: "#6d7175",
      marginBottom: "0.5rem",
      textTransform: "uppercase",
    },
    hero: {
      position: "relative",
      borderRadius: "6px",
      overflow: "hidden",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    heroOverlay: {
      position: "absolute",
      inset: 0,
      background: overlayGradient,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      padding: "12px 16px",
      color: "#fff",
    },
    announcement: {
      padding: "10px 16px",
      textAlign: "center",
      fontSize: "0.875rem",
      borderRadius: "4px",
    },
    countdown: {
      padding: "16px",
      textAlign: "center",
      borderRadius: "6px",
    },
    countdownTimer: {
      display: "flex",
      justifyContent: "center",
      gap: "8px",
      margin: "8px 0",
      fontSize: "1rem",
      fontWeight: "bold",
    },
    iwt: {
      display: "flex",
      gap: "16px",
      alignItems: "center",
      padding: "16px",
      backgroundColor: "#fff",
      borderRadius: "6px",
      border: "1px solid #e1e3e5",
    },
    promo: {
      border: "1px solid #e1e3e5",
      borderRadius: "8px",
      overflow: "hidden",
      backgroundColor: "#fff",
    },
    promoBody: { padding: "16px" },
    button: {
      display: "inline-block",
      alignSelf: textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start",
      padding: btnPadding,
      borderRadius: btnRadius,
      fontSize: btnFontSize,
      fontWeight: 600,
      marginTop: "8px",
      backgroundColor: btnBg,
      color: btnColor,
    },
    headline: { fontSize: headSize, fontWeight: "bold", color: headColor, marginBottom: "4px", textAlign },
    description: { fontSize: descSize, color: descColor, marginBottom: "4px", textAlign },
  };

  if (!blockType) return null;

  const isMobileFrame = variant === "pane" && viewport === "mobile";
  const mobileFrameStyle = {
    width: 375,
    maxWidth: "100%",
    margin: "0 auto",
    border: "1px solid #e1e3e5",
    borderRadius: 0,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    minHeight: isAdaptToImage ? 0 : 400,
  };

  const cssClass = (data.css_class || "").trim();
  const customCss = (data.custom_css || "").trim();

  const content = (
    <div
      className={`theme-stream${cssClass ? ` ${cssClass}` : ""}`}
      style={{
        ...previewStyles.container,
        ...(isMobileFrame ? { borderRadius: 0, width: "100%", minWidth: 0, boxSizing: "border-box" } : {}),
      }}
    >
      {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
      {variant !== "pane" && <div style={previewStyles.label}>Preview</div>}
      {blockType === "hero" && (
        <div style={{ ...previewStyles.hero, minHeight: isAdaptToImage ? undefined : (bannerMinHeight ?? 200), ...(variant === "pane" ? { borderRadius: 0 } : {}) }}>
          {(heroImgUrl || imgUrl) && (
            isAdaptToImage ? (
              <img src={heroImgUrl || imgUrl} alt="" style={{ display: "block", width: "100%", height: "auto", verticalAlign: "top" }} />
            ) : (
              <img src={heroImgUrl || imgUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: imgFit }} />
            )
          )}
          <div style={{ ...previewStyles.heroOverlay, alignItems: textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start", textAlign }}>
            {(data.headline || data.description || data.button_text) && (
              <>
                {data.headline && <div style={previewStyles.headline}>{data.headline}</div>}
                {data.description && <div style={previewStyles.description}>{data.description}</div>}
                {data.button_text && (
                  <span className="theme-stream__button" style={previewStyles.button}>{data.button_text}</span>
                )}
              </>
            )}
            {!data.headline && !data.description && !data.button_text && (
              <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>Add headline, description, or button to preview</div>
            )}
          </div>
        </div>
      )}
      {blockType === "announcement_bar" && (
        <div
          style={{
            ...previewStyles.announcement,
            backgroundColor: data.announcement_bg_color || "#000000",
            color: data.announcement_text_color || "#ffffff",
          }}
        >
          {data.announcement_text || "Enter your announcement message"}
        </div>
      )}
      {blockType === "collection_banner" && (
        <div style={{ position: "relative", minHeight: isAdaptToImage ? undefined : (bannerMinHeight ?? 200), borderRadius: variant === "pane" ? 0 : "6px", overflow: "hidden", backgroundColor: "#e1e3e5" }}>
          {imgUrl && (isAdaptToImage ? <img src={imgUrl} alt="" style={{ display: "block", width: "100%", height: "auto", verticalAlign: "top" }} /> : <img src={imgUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: imgFit }} />)}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px", background: overlayOpacity > 0 ? `linear-gradient(transparent, rgba(${hexToRgb(overlayColor)},${overlayOpacity}))` : "transparent", color: "#fff", textAlign }}>
            <div style={previewStyles.headline}>{data.collection_headline || `Collection: ${data.collection_handle || "..."}`}</div>
            {data.collection_description && <div style={previewStyles.description}>{data.collection_description}</div>}
            {data.collection_button_text && <span className="theme-stream__button" style={previewStyles.button}>{data.collection_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "countdown_banner" && (
        <div
          style={{
            ...previewStyles.countdown,
            position: "relative",
            minHeight: bannerMinHeight ?? 200,
            backgroundColor: data.countdown_bg_color || "#000000",
            color: data.countdown_text_color || "#ffffff",
          }}
        >
          {imgUrl && (
            <div style={{ position: "absolute", inset: 0, opacity: overlayOpacity }}>
              <img src={imgUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: imgFit }} />
            </div>
          )}
          <div style={{ position: "relative", zIndex: 1, textAlign }}>
            {data.countdown_headline && <div style={previewStyles.headline}>{data.countdown_headline}</div>}
            <div style={previewStyles.countdownTimer}>
              <span>0</span>d <span>0</span>h <span>0</span>m <span>0</span>s
            </div>
            {data.countdown_subtext && <div style={previewStyles.description}>{data.countdown_subtext}</div>}
            {data.countdown_button_text && <span className="theme-stream__button" style={{ ...previewStyles.button, backgroundColor: btnBg || "rgba(255,255,255,0.2)", color: btnColor || "#fff" }}>{data.countdown_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "image_with_text" && (
        <div style={{
          ...previewStyles.iwt,
          flexDirection: isMobile ? "column" : (data.image_with_text_layout === "image_right" ? "row-reverse" : "row"),
        }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: isMobile ? 120 : 80 }}>
            {imgUrl ? (
              <img src={imgUrl} alt="" style={{ width: "100%", height: isMobile ? 120 : 80, objectFit: imgFit, borderRadius: "4px" }} />
            ) : (
              <div style={{ width: "100%", height: isMobile ? 120 : 80, backgroundColor: "#e1e3e5", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "#6d7175" }}>Image</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign }}>
            {data.image_with_text_headline && <div style={{ ...previewStyles.headline, color: headColor || "#333" }}>{data.image_with_text_headline}</div>}
            {data.image_with_text_description && <div style={{ ...previewStyles.description, color: descColor || "#6d7175" }}>{data.image_with_text_description}</div>}
            {data.image_with_text_button_text && <span className="theme-stream__button" style={previewStyles.button}>{data.image_with_text_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "background_video" && (
        <div style={{ position: "relative", minHeight: bannerMinHeight ?? 200, borderRadius: "6px", overflow: "hidden", backgroundColor: "#1a1a1a" }}>
          {videoUrl ? (
            <video src={videoUrl} muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: imgFit }} />
          ) : (
            <div style={{ width: "100%", minHeight: bannerMinHeight ?? 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#6d7175", fontSize: "0.875rem" }}>Add video URL or select from library</div>
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(${hexToRgb(overlayColor)},${overlayOpacity})`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start",
              padding: "16px",
              color: "#fff",
              textAlign,
            }}
          >
            {data.video_headline && <div style={previewStyles.headline}>{data.video_headline}</div>}
            {data.video_description && <div style={previewStyles.description}>{data.video_description}</div>}
            {data.video_button_text && <span className="theme-stream__button" style={previewStyles.button}>{data.video_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "promo_card" && (
        <div style={previewStyles.promo}>
          {imgUrl ? (
            <img src={imgUrl} alt="" style={{ width: "100%", height: isMobile ? 140 : 100, objectFit: imgFit }} />
          ) : (
            <div style={{ width: "100%", height: isMobile ? 140 : 100, backgroundColor: "#e1e3e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "#6d7175" }}>Image</div>
          )}
          <div style={{ ...previewStyles.promoBody, textAlign }}>
            {data.promo_card_title && <div style={{ ...previewStyles.headline, color: headColor || "#333" }}>{data.promo_card_title}</div>}
            {data.promo_card_description && <div style={{ ...previewStyles.description, color: descColor || "#6d7175" }}>{data.promo_card_description}</div>}
            {data.promo_card_cta_text && <span className="theme-stream__button" style={previewStyles.button}>{data.promo_card_cta_text}</span>}
          </div>
        </div>
      )}
    </div>
  );

  return isMobileFrame ? <div style={mobileFrameStyle}>{content}</div> : content;
}
