/**
 * Live preview of scheduled block types as they would appear on the storefront.
 * Renders a simplified version of each block type for the Create/Edit modals.
 */
export default function BlockPreview({ blockType, data = {}, mediaFiles = [], videoFiles = [] }) {
  const resolveUrl = (id) => {
    if (!id) return null;
    const file = mediaFiles.find((f) => f.id === id) || videoFiles.find((f) => f.id === id);
    return file?.url || null;
  };

  const imgUrl = resolveUrl(data.desktop_banner || data.image || data.collection_banner_image || data.countdown_bg_image || data.image_with_text_image || data.promo_card_image);
  const videoUrl = data.video_url || resolveUrl(data.video_file);

  const previewStyles = {
    container: {
      marginTop: "1rem",
      padding: "1rem",
      backgroundColor: "#f9fafb",
      borderRadius: "8px",
      border: "1px solid #e1e3e5",
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
      minHeight: 120,
      borderRadius: "6px",
      overflow: "hidden",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    },
    heroOverlay: {
      position: "absolute",
      inset: 0,
      background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)",
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
      padding: "8px 16px",
      borderRadius: "6px",
      fontSize: "0.875rem",
      fontWeight: 600,
      marginTop: "8px",
    },
  };

  if (!blockType) return null;

  return (
    <div style={previewStyles.container}>
      <div style={previewStyles.label}>Preview</div>
      {blockType === "hero" && (
        <div style={previewStyles.hero}>
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          <div style={previewStyles.heroOverlay}>
            {(data.headline || data.description || data.button_text) && (
              <>
                {data.headline && <div style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "4px" }}>{data.headline}</div>}
                {data.description && <div style={{ fontSize: "0.8rem", opacity: 0.9, marginBottom: "4px" }}>{data.description}</div>}
                {data.button_text && (
                  <span style={{ ...previewStyles.button, backgroundColor: "#fff", color: "#667eea" }}>{data.button_text}</span>
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
        <div style={{ position: "relative", minHeight: 100, borderRadius: "6px", overflow: "hidden", backgroundColor: "#e1e3e5" }}>
          {imgUrl && <img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px", background: "linear-gradient(transparent, rgba(0,0,0,0.7))", color: "#fff" }}>
            <div style={{ fontWeight: "bold" }}>{data.collection_headline || `Collection: ${data.collection_handle || "..."}`}</div>
            {data.collection_description && <div style={{ fontSize: "0.8rem" }}>{data.collection_description}</div>}
            {data.collection_button_text && <span style={{ ...previewStyles.button, backgroundColor: "#fff", color: "#333" }}>{data.collection_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "countdown_banner" && (
        <div
          style={{
            ...previewStyles.countdown,
            position: "relative",
            backgroundColor: data.countdown_bg_color || "#000000",
            color: data.countdown_text_color || "#ffffff",
          }}
        >
          {imgUrl && (
            <div style={{ position: "absolute", inset: 0, opacity: 0.3 }}>
              <img src={imgUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          )}
          <div style={{ position: "relative", zIndex: 1 }}>
            {data.countdown_headline && <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{data.countdown_headline}</div>}
            <div style={previewStyles.countdownTimer}>
              <span>0</span>d <span>0</span>h <span>0</span>m <span>0</span>s
            </div>
            {data.countdown_subtext && <div style={{ fontSize: "0.875rem" }}>{data.countdown_subtext}</div>}
            {data.countdown_button_text && <span style={{ ...previewStyles.button, backgroundColor: "rgba(255,255,255,0.2)", display: "inline-block", marginTop: "8px" }}>{data.countdown_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "image_with_text" && (
        <div style={{ ...previewStyles.iwt, flexDirection: data.image_with_text_layout === "image_right" ? "row-reverse" : "row" }}>
          <div style={{ flex: 1, minWidth: 80 }}>
            {imgUrl ? (
              <img src={imgUrl} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: "4px" }} />
            ) : (
              <div style={{ width: "100%", height: 80, backgroundColor: "#e1e3e5", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "#6d7175" }}>Image</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {data.image_with_text_headline && <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{data.image_with_text_headline}</div>}
            {data.image_with_text_description && <div style={{ fontSize: "0.8rem", color: "#6d7175", marginBottom: "4px" }}>{data.image_with_text_description}</div>}
            {data.image_with_text_button_text && <span style={{ ...previewStyles.button, backgroundColor: "#667eea", color: "#fff" }}>{data.image_with_text_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "background_video" && (
        <div style={{ position: "relative", minHeight: 120, borderRadius: "6px", overflow: "hidden", backgroundColor: "#1a1a1a" }}>
          {videoUrl ? (
            <video src={videoUrl} muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#6d7175", fontSize: "0.875rem" }}>Add video URL or select from library</div>
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(0,0,0,${(data.video_overlay_opacity ?? 50) / 100})`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "16px",
              color: "#fff",
            }}
          >
            {data.video_headline && <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{data.video_headline}</div>}
            {data.video_description && <div style={{ fontSize: "0.8rem", marginBottom: "4px" }}>{data.video_description}</div>}
            {data.video_button_text && <span style={{ ...previewStyles.button, backgroundColor: "#fff", color: "#333" }}>{data.video_button_text}</span>}
          </div>
        </div>
      )}
      {blockType === "promo_card" && (
        <div style={previewStyles.promo}>
          {imgUrl ? (
            <img src={imgUrl} alt="" style={{ width: "100%", height: 100, objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: 100, backgroundColor: "#e1e3e5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "#6d7175" }}>Image</div>
          )}
          <div style={previewStyles.promoBody}>
            {data.promo_card_title && <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{data.promo_card_title}</div>}
            {data.promo_card_description && <div style={{ fontSize: "0.8rem", color: "#6d7175", marginBottom: "4px" }}>{data.promo_card_description}</div>}
            {data.promo_card_cta_text && <span style={{ ...previewStyles.button, backgroundColor: "#667eea", color: "#fff" }}>{data.promo_card_cta_text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
