import { useCallback, useEffect, useRef, useState, useId } from "react";
import { useFetcher, useLoaderData, useNavigation, useRevalidator, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { boundary } from "@shopify/shopify-app-react-router/server";
import PropTypes from "prop-types";
import { formatUTCForDateTimeInput, formatUTCForDisplay } from "../components/BlockScheduler/utils";
import BlockPreview from "../components/BlockPreview";
export { loader, action } from "../services/block-scheduler.server";

/** "two-column" = preview left, data right. "stacked" = preview on top, data below. */
const MODAL_LAYOUT = "two-column";

const isDevEnvironment =
  (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "production") || typeof import.meta === "undefined";
const debugLog = (...args) => {
  if (isDevEnvironment) {
    console.log(...args);
  }
};

export default function BlockSchedulerPage() {
  const loaderData = useLoaderData();
  const initialEntries = loaderData?.entries ?? [];
  const loaderMediaFiles = loaderData?.mediaFiles ?? [];
  const loaderVideoFiles = loaderData?.videoFiles ?? [];
  const mediaFiles = loaderMediaFiles;
  const loaderError = loaderData?.error ?? null;
  const redirectUrl = loaderData?.redirectUrl ?? null;
  const storeTimeZone = loaderData?.storeTimeZone ?? "UTC";
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const formRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [formStatusActive, setFormStatusActive] = useState(false);
  const handledResponseRef = useRef(null);
  const [sortConfig, setSortConfig] = useState([]); // Array of {column: string, direction: 'asc'|'desc'}
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [positionEditTarget, setPositionEditTarget] = useState(null);
  const [positionFormName, setPositionFormName] = useState("");
  const [positionFormDesc, setPositionFormDesc] = useState("");
  const [positionDeleteConfirm, setPositionDeleteConfirm] = useState(null);
  const [userTimeZone, setUserTimeZone] = useState("UTC");
  const [userTimezoneOffset, setUserTimezoneOffset] = useState(0);
  const [formBlockType, setFormBlockType] = useState("hero");
  const [previewData, setPreviewData] = useState({});
  const [previewViewport, setPreviewViewport] = useState("desktop");
  const previewDebounceRef = useRef(null);
  const statusInputId = useId();
  const blockTypes = loaderData?.blockTypes ?? {};
  const defaultBlockType = loaderData?.defaultBlockType ?? "hero";
  const positions = loaderData?.positions ?? [];

  const performRedirect = useCallback(
    (url, source) => {
      if (!url) {
        return;
      }

      debugLog(`[CLIENT] Billing redirect requested from ${source}:`, url);

      if (shopify) {
        try {
          const redirect = Redirect.create(shopify);
          redirect.dispatch(Redirect.Action.REMOTE, {
            url,
            newContext: true,
          });
          return;
        } catch (error) {
          console.error("[CLIENT] Failed to dispatch App Bridge redirect:", error);
        }
      }

      if (typeof window !== "undefined") {
        window.open(url, "_top");
      }
    },
    [shopify],
  );

  const readFormData = useCallback(() => {
    const form = formRef.current;
    if (!form) return {};
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") data[k] = v;
    }
    return data;
  }, []);

  const updatePreview = useCallback(() => {
    setPreviewData(readFormData());
  }, [readFormData]);

  useEffect(() => {
    if (!showForm) return;
    const t = setTimeout(updatePreview, 100);
    return () => clearTimeout(t);
  }, [showForm, formBlockType, updatePreview]);

  useEffect(() => {
    if (!showForm) return;
    const id = setInterval(updatePreview, 400);
    return () => clearInterval(id);
  }, [showForm, updatePreview]);

  const handleFormInput = useCallback(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(updatePreview, 150);
  }, [updatePreview]);

  useEffect(() => {
    // Skip if no fetcher data
    if (!fetcher.data) {
      return;
    }

    // Only process when fetcher is idle (not submitting)
    if (fetcher.state !== "idle") {
      return;
    }

    // Create a unique identifier for this response
    const responseId = JSON.stringify(fetcher.data);
    
    // Skip if we've already handled this exact response
    if (handledResponseRef.current === responseId) {
      return;
    }

    debugLog("[CLIENT] Handling new fetcher response:", fetcher.data);
    if (fetcher.data?.redirectUrl) {
      performRedirect(fetcher.data.redirectUrl, "action");
      handledResponseRef.current = responseId;
      return;
    }
    
    if (fetcher.data?.error) {
      console.error("[CLIENT] Error in fetcher data:", fetcher.data.error);
      handledResponseRef.current = responseId;
    } else if (fetcher.data?.success === false) {
      console.error("[CLIENT] Failed to create entry");
      handledResponseRef.current = responseId;
    } else if (fetcher.data?.success === true) {
      debugLog("[CLIENT] Entry created successfully, reloading entries");
      handledResponseRef.current = responseId;
      // Reload the entries list
      revalidator.revalidate();
      // Reset the form
      if (formRef.current) {
        formRef.current.reset();
      }
      // Reset toggle state
      setFormStatusActive(false);
      // Close the modal after successful submission
      setShowForm(false);
    }
  }, [fetcher.data, fetcher.state, performRedirect, revalidator]);

  // Clear handled response when starting a new submission
  useEffect(() => {
    if (fetcher.state === "submitting") {
      handledResponseRef.current = null;
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (loaderError) {
      console.error("[CLIENT] Loader error:", loaderError);
    }
  }, [loaderError]);

  useEffect(() => {
    if (!redirectUrl) {
      return;
    }
    performRedirect(redirectUrl, "loader");
  }, [redirectUrl, performRedirect]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const resolvedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setUserTimeZone(resolvedZone || "UTC");
      setUserTimezoneOffset(new Date().getTimezoneOffset() * -1);
    }
  }, []);

  // Function to close form and reset toggle
  const handleCloseForm = () => {
    setShowForm(false);
    setFormStatusActive(false);
    setFormBlockType(defaultBlockType);
    if (formRef.current) {
      formRef.current.reset();
    }
  };

  const isLoading = navigation.state === "submitting" || fetcher.state === "submitting";

  return (
    <s-page heading="Block Scheduler | Entries">
      {(loaderError || fetcher.data?.error) && (
        <s-banner tone="critical" title="Error">
          {loaderError || fetcher.data?.error}
        </s-banner>
      )}
      <s-section>
        <h2 style={{ fontSize: "1.2rem", lineHeight: 1.1, margin: "0 0 10px 0" }}>Create Entry</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            border: "none",
            borderRadius: "4px",
            background: "#008060",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "600",
          }}
        >
          New Entry
        </button>
      </s-section>

      {/* Modal Overlay */}
      {showForm && (
        <div
          role="presentation"
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create new entry"
            tabIndex={-1}
            className={`create-modal-dialog${MODAL_LAYOUT === "stacked" ? " create-modal-stacked" : ""}`}
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "1400px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
            }}
          >
            <style>{`
              .create-modal-dialog .create-modal-body { display: flex; flex-direction: row; flex: 1; min-height: 0; }
              .create-modal-dialog .create-modal-preview { flex: 0 0 60%; padding: 0; border-right: 1px solid #e1e3e5; display: flex; flex-direction: column; min-width: 0; overflow-y: auto; }
              .create-modal-dialog .create-modal-data { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem; }
              .create-modal-dialog .create-modal-data .data-field-row { flex-direction: column; }
              .create-modal-dialog.create-modal-stacked .create-modal-body { flex-direction: column; }
              .create-modal-dialog.create-modal-stacked .create-modal-preview { flex: 0 0 auto; border-right: none; border-bottom: 1px solid #e1e3e5; }
              @media (max-width: 768px) {
                .create-modal-dialog .create-modal-body { flex-direction: column; }
                .create-modal-dialog .create-modal-preview { flex: 0 0 auto; border-right: none; border-bottom: 1px solid #e1e3e5; }
              }
            `}</style>
            <div style={{ padding: "1.5rem", borderBottom: "1px solid #e1e3e5", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "600" }}>Create New Entry</h2>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "1.5rem",
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content: two-column layout */}
            <div className="create-modal-body">
              <div className="create-modal-preview">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 0.75rem 1.5rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6d7175", textTransform: "uppercase" }}>Preview</span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport("desktop")}
                      style={{
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        background: previewViewport === "desktop" ? "#e1e3e5" : "white",
                        cursor: "pointer",
                        fontWeight: previewViewport === "desktop" ? 600 : 400,
                      }}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport("mobile")}
                      style={{
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        background: previewViewport === "mobile" ? "#e1e3e5" : "white",
                        cursor: "pointer",
                        fontWeight: previewViewport === "mobile" ? 600 : 400,
                      }}
                    >
                      Mobile
                    </button>
                  </div>
                </div>
                <BlockPreview
                  blockType={formBlockType}
                  data={previewData}
                  mediaFiles={loaderMediaFiles || []}
                  videoFiles={loaderVideoFiles || []}
                  variant="pane"
                  viewport={previewViewport}
                />
              </div>
              <div className="create-modal-data">
              <fetcher.Form method="post" ref={formRef} encType="application/x-www-form-urlencoded" onInput={handleFormInput}>
          <s-stack direction="block" gap="base">
            <input type="hidden" name="store_timezone" value={storeTimeZone} readOnly />
            <input type="hidden" name="timezone_offset" value={userTimezoneOffset} readOnly />
            <input type="hidden" name="timezone" value={userTimeZone} readOnly />
            <input type="hidden" name="block_type" value={formBlockType} readOnly />
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Block Type</label>
              <select
                value={formBlockType}
                onChange={(e) => setFormBlockType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  fontSize: "0.875rem",
                }}
              >
                {Object.values(blockTypes).map((bt) => (
                  <option key={bt.key} value={bt.key}>
                    {bt.label}
                  </option>
                ))}
              </select>
            </div>
            <s-text-field
              label="Title"
              name="title"
              required
              placeholder="Display title for this schedulable entry"
            />
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Position <span style={{ color: "#d72c0d" }}>*</span></label>
              <select
                name="position_id"
                required
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "0.875rem" }}
              >
                <option value="">Select position...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.handle}>
                    {p.name}{p.description ? ` — ${p.description}` : ""}
                  </option>
                ))}
              </select>
              {positions.length === 0 && (
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#6d7175" }}>No positions yet. Add one in the Positions section below.</p>
              )}
            </div>
                  <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.8125rem", color: "#6d7175" }}>
                    Times are in store timezone ({storeTimeZone}).{userTimeZone !== storeTimeZone && (
                      <> In your timezone ({userTimeZone}): times will differ.</>
                    )}
                  </p>
                  {formBlockType === "hero" && (
                    <>
                  <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <MediaLibraryPicker
                        name="desktop_banner"
                        label="Desktop Banner"
                        mediaFiles={loaderMediaFiles || []}
                        onSelect={() => setTimeout(updatePreview, 50)}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <MediaLibraryPicker
                        name="mobile_banner"
                        label="Mobile Banner"
                        mediaFiles={loaderMediaFiles || []}
                        onSelect={() => setTimeout(updatePreview, 50)}
                      />
                    </div>
                  </div>
                  <s-text-field
                    label="Headline"
                    name="headline"
                    placeholder="Headline text"
                  />
                  <s-text-field
                    label="Description"
                    name="description"
                    multiline={3}
                    placeholder="Short description or summary"
                  />
                  <s-url-field
                    label="Target URL"
                    name="target_url"
                    placeholder="https://example.com"
                  />
                  <s-text-field
                    label="Button Text"
                    name="button_text"
                    placeholder="Button text"
                  />
                    </>
                  )}
                  {formBlockType === "announcement_bar" && (
                    <>
                  <s-text-field
                    label="Message"
                    name="announcement_text"
                    required
                    placeholder="e.g. Free shipping on orders over $50"
                  />
                  <s-url-field
                    label="Link URL"
                    name="announcement_link"
                    placeholder="https://example.com"
                  />
                  <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Background Color</label>
                      <input
                        type="color"
                        name="announcement_bg_color"
                        defaultValue="#000000"
                        style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Text Color</label>
                      <input
                        type="color"
                        name="announcement_text_color"
                        defaultValue="#ffffff"
                        style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }}
                      />
                    </div>
                  </div>
                    </>
                  )}
                  {formBlockType === "collection_banner" && (
                    <>
                  <s-text-field
                    label="Collection Handle"
                    name="collection_handle"
                    required
                    placeholder="e.g. summer-collection"
                  />
                  <MediaLibraryPicker
                    name="collection_banner_image"
                    label="Banner Image (optional override)"
                    mediaFiles={loaderMediaFiles || []}
                    onSelect={() => setTimeout(updatePreview, 50)}
                  />
                  <s-text-field
                    label="Headline Override"
                    name="collection_headline"
                    placeholder="Leave blank to use collection title"
                  />
                  <s-text-field
                    label="Description"
                    name="collection_description"
                    multiline={2}
                    placeholder="Short description"
                  />
                  <s-text-field
                    label="Button Text"
                    name="collection_button_text"
                    placeholder="Shop Now"
                  />
                    </>
                  )}
                  {formBlockType === "countdown_banner" && (
                    <>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Target Date & Time</label>
                    <input
                      type="datetime-local"
                      name="countdown_target_date"
                      required
                      style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }}
                    />
                  </div>
                  <s-text-field label="Headline" name="countdown_headline" placeholder="Sale ends in" />
                  <s-text-field label="Subtext" name="countdown_subtext" placeholder="Don't miss out!" />
                  <MediaLibraryPicker
                    name="countdown_bg_image"
                    label="Background Image"
                    mediaFiles={loaderMediaFiles || []}
                    onSelect={() => setTimeout(updatePreview, 50)}
                  />
                  <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Background Color</label>
                      <input type="color" name="countdown_bg_color" defaultValue="#000000" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Text Color</label>
                      <input type="color" name="countdown_text_color" defaultValue="#ffffff" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                    </div>
                  </div>
                  <s-url-field label="Link URL" name="countdown_target_url" placeholder="https://..." />
                  <s-text-field label="Button Text" name="countdown_button_text" placeholder="Shop Now" />
                    </>
                  )}
                  {formBlockType === "image_with_text" && (
                    <>
                  <MediaLibraryPicker
                    name="image_with_text_image"
                    label="Image"
                    mediaFiles={loaderMediaFiles || []}
                    onSelect={() => setTimeout(updatePreview, 50)}
                  />
                  <s-text-field label="Headline" name="image_with_text_headline" placeholder="Headline" />
                  <s-text-field label="Description" name="image_with_text_description" multiline={3} placeholder="Description" />
                  <s-text-field label="Button Text" name="image_with_text_button_text" placeholder="Learn More" />
                  <s-url-field label="Button Link" name="image_with_text_button_link" placeholder="https://..." />
                  <div style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Layout</label>
                    <select name="image_with_text_layout" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                      <option value="image_left">Image Left</option>
                      <option value="image_right">Image Right</option>
                    </select>
                  </div>
                    </>
                  )}
                  {formBlockType === "background_video" && (
                    <>
                  <s-url-field
                    label="Video URL (hosted MP4/WebM)"
                    name="video_url"
                    placeholder="https://cdn.example.com/video.mp4"
                  />
                  <MediaLibraryPicker
                    name="video_file"
                    label="Or select video from Shopify"
                    mediaFiles={loaderVideoFiles || []}
                    onSelect={() => setTimeout(updatePreview, 50)}
                  />
                  <s-text-field label="Headline" name="video_headline" placeholder="Headline" />
                  <s-text-field label="Description" name="video_description" multiline={2} placeholder="Description" />
                  <s-text-field label="Button Text" name="video_button_text" placeholder="Shop Now" />
                  <s-url-field label="Button Link" name="video_button_link" placeholder="https://..." />
                    </>
                  )}
                  {formBlockType === "promo_card" && (
                    <>
                  <MediaLibraryPicker
                    name="promo_card_image"
                    label="Image"
                    mediaFiles={loaderMediaFiles || []}
                    onSelect={() => setTimeout(updatePreview, 50)}
                  />
                  <s-text-field label="Title" name="promo_card_title" placeholder="Promo title" />
                  <s-text-field label="Description" name="promo_card_description" multiline={2} placeholder="Short description" />
                  <s-url-field label="CTA Link" name="promo_card_cta_url" placeholder="https://..." />
                  <s-text-field label="CTA Text" name="promo_card_cta_text" placeholder="Shop Now" />
                    </>
                  )}
                  {["hero", "collection_banner", "countdown_banner", "image_with_text", "background_video", "promo_card"].includes(formBlockType) && (
                    <div style={{ marginBottom: "0.5rem", padding: "0.75rem", backgroundColor: "#f0f4f8", borderRadius: "4px" }}>
                      <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Image / Video</p>
                      <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Height (Desktop)</label>
                          <select name="image_height" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                            <option value="adapt_to_image">Adapt to image (exact proportions, width 100%)</option>
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                            <option value="full_screen">Full screen</option>
                          </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Height (Mobile)</label>
                          <select name="image_height_mobile" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                            <option value="adapt_to_image">Adapt to image (exact proportions, width 100%)</option>
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                            <option value="full_screen">Full screen</option>
                          </select>
                        </div>
                      </div>
                      <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Fit (Desktop)</label>
                          <select name="image_fit" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                            <option value="fill">Fill</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Fit (Mobile)</label>
                          <select name="image_fit_mobile" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                            <option value="cover">Cover</option>
                            <option value="contain">Contain</option>
                            <option value="fill">Fill</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #e1e3e5" }}>
                        <p style={{ margin: "0 0 0.5rem 0", fontWeight: "500", fontSize: "0.8125rem" }}>Overlay (0 = off)</p>
                        <div className="data-field-row" style={{ display: "flex", gap: "15px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Opacity (0-100)</label>
                            <input type="number" name="overlay_opacity" min={0} max={100} defaultValue={70} placeholder="70" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Color</label>
                            <input type="color" name="overlay_color" defaultValue="#000000" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {["hero", "collection_banner", "countdown_banner", "image_with_text", "background_video", "promo_card"].includes(formBlockType) && (
                    <div style={{ marginBottom: "0.5rem", padding: "0.75rem", backgroundColor: "#f0f4f8", borderRadius: "4px" }}>
                      <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Button</p>
                      <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Background</label>
                          <input type="color" name="button_bg_color" defaultValue="#ffffff" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Text Color</label>
                          <input type="color" name="button_text_color" defaultValue="#667eea" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                        </div>
                      </div>
                      <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Border radius (px)</label>
                          <input type="number" name="button_border_radius" placeholder="6" defaultValue={6} min={0} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Padding vertical (px)</label>
                          <input type="number" name="button_padding_vertical" placeholder="12" defaultValue={12} min={0} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Padding horizontal (px)</label>
                          <input type="number" name="button_padding_horizontal" placeholder="24" defaultValue={24} min={0} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Font size (em)</label>
                          <input type="number" name="button_font_size" placeholder="1" defaultValue={1} step={0.1} min={0.5} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {["hero", "collection_banner", "countdown_banner", "image_with_text", "background_video", "promo_card"].includes(formBlockType) && (
                    <div style={{ marginBottom: "0.5rem", padding: "0.75rem", backgroundColor: "#f0f4f8", borderRadius: "4px" }}>
                      <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Text</p>
                      <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Headline size (em)</label>
                          <input type="number" name="headline_font_size" placeholder="1.5" step={0.1} min={0.5} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Description size (em)</label>
                          <input type="number" name="description_font_size" placeholder="0.9" step={0.1} min={0.5} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Headline color</label>
                          <input type="color" name="headline_color" defaultValue="#ffffff" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Description color</label>
                          <input type="color" name="description_color" defaultValue="#ffffff" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Alignment</label>
                          <select name="text_alignment" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        {formBlockType === "hero" && (
                          <>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Content position</label>
                              <select name="vertical_alignment" defaultValue="bottom" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                                <option value="top">Top</option>
                                <option value="center">Center</option>
                                <option value="bottom">Bottom</option>
                              </select>
                            </div>
                            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", paddingBottom: "0.5rem" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "500", fontSize: "0.8125rem" }}>
                                <input type="checkbox" name="mobile_content_below" value="on" style={{ width: "18px", height: "18px" }} />
                                Show content below image on mobile
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                      {formBlockType === "hero" && (
                        <>
                          <p style={{ margin: "0.5rem 0 0.25rem 0", fontSize: "0.75rem", color: "#6d7175" }}>When content below image (mobile):</p>
                          <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Headline color</label>
                              <input type="color" name="headline_color_below" defaultValue="#2c3e50" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Description color</label>
                              <input type="color" name="description_color_below" defaultValue="#666666" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Button bg</label>
                              <input type="color" name="button_bg_color_below" defaultValue="#667eea" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Button text</label>
                              <input type="color" name="button_text_color_below" defaultValue="#ffffff" style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ marginBottom: "0.5rem", padding: "0.75rem", backgroundColor: "#f6f6f7", borderRadius: "4px" }}>
                    <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Styling</p>
                    <s-text-field label="CSS Class" name="css_class" placeholder="e.g. my-custom-banner" />
                    <div style={{ marginTop: "0.5rem" }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Custom CSS</label>
                      <textarea name="custom_css" placeholder=".my-custom-banner .scheduled-banner__button { border-radius: 20px; }" rows={4} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "0.8125rem", fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label htmlFor="start_at" style={{ display: "block", marginBottom: "0", fontWeight: "500", fontSize: "0.8125rem" }}>
                        Start Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        id="start_at"
                        name="start_at"
                        style={{
                          width: "100%",
                          padding: "0.375rem 0.5rem",
                          border: "1px solid #c9cccf",
                          borderRadius: "4px",
                          fontSize: "0.8125rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label htmlFor="end_at" style={{ display: "block", marginBottom: "0", fontWeight: "500", fontSize: "0.8125rem" }}>
                        End Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        id="end_at"
                        name="end_at"
                        style={{
                          width: "100%",
                          padding: "0.375rem 0.5rem",
                          border: "1px solid #c9cccf",
                          borderRadius: "4px",
                          fontSize: "0.8125rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: "0.5rem" }}>
                    <p style={{ marginBottom: "0.5rem", fontWeight: "500", fontSize: "0.875rem" }}>
                      Entry Status
                    </p>
                    <label
                      htmlFor={statusInputId}
                      style={{ 
                        display: "inline-flex", 
                        alignItems: "center", 
                        gap: "0.5rem",
                        cursor: "pointer",
                        position: "relative",
                      }}
                    >
                      <input
                        id={statusInputId}
                        type="checkbox"
                        name="status"
                        value="on"
                        checked={formStatusActive}
                        onChange={(e) => setFormStatusActive(e.target.checked)}
                        style={{
                          opacity: 0,
                          width: 0,
                          height: 0,
                          position: "absolute",
                        }}
                      />
                      <span
                        style={{
                          position: "relative",
                          cursor: "pointer",
                          width: "44px",
                          height: "24px",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            width: "1px",
                            height: "1px",
                            padding: 0,
                            margin: "-1px",
                            overflow: "hidden",
                            clip: "rect(0, 0, 0, 0)",
                            whiteSpace: "nowrap",
                            border: 0,
                          }}
                        >
                          {formStatusActive ? "Set entry to draft" : "Set entry to active"}
                        </span>
                        <span
                          style={{
                            position: "absolute",
                            cursor: "pointer",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: formStatusActive ? "#667eea" : "#c9cccf",
                            borderRadius: "24px",
                            transition: "background-color 0.2s",
                          }}
                          className="toggle-track"
                        >
                          <span
                            style={{
                              position: "absolute",
                              content: '""',
                              height: "18px",
                              width: "18px",
                              left: formStatusActive ? "22px" : "3px",
                              bottom: "3px",
                              backgroundColor: "white",
                              borderRadius: "50%",
                              transition: "left 0.2s",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                            }}
                            className="toggle-thumb"
                          />
                        </span>
                      </span>
                      <span style={{ fontSize: "0.875rem", color: "#667eea", fontWeight: "500" }}>
                        Active (published)
                      </span>
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={handleCloseForm}
                      disabled={isLoading}
                      style={{
                        padding: "0.5rem 1rem",
                        border: "1px solid #c9cccf",
                        borderRadius: "4px",
                        backgroundColor: "white",
                        cursor: isLoading ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <s-button type="submit" disabled={isLoading} variant="primary">
                      {isLoading ? "Creating..." : "Create Entry"}
                    </s-button>
                  </div>
          </s-stack>
        </fetcher.Form>
              </div>
            </div>
          </div>
        </div>
      )}

      <s-section>
        <h2 style={{ fontSize: "1.2rem", lineHeight: 1.1, margin: "0 0 10px 0" }}>Existing Entries</h2>
        {initialEntries.length === 0 ? (
          <s-text>No entries yet. Create your first schedulable entry above.</s-text>
        ) : (
          <div style={{ overflowX: "auto", width: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                {(() => {
                  // Sort handler function
                  const handleSort = (column) => {
                    setSortConfig((prev) => {
                      const existingIndex = prev.findIndex((s) => s.column === column);
                      
                      if (existingIndex >= 0) {
                        // Column already in sort - toggle direction
                        const updated = [...prev];
                        if (updated[existingIndex].direction === 'asc') {
                          updated[existingIndex] = { column, direction: 'desc' };
                        } else {
                          // Remove from sort if going from desc to nothing
                          updated.splice(existingIndex, 1);
                        }
                        return updated;
                      } else {
                        // New column - add with ascending
                        return [...prev, { column, direction: 'asc' }];
                      }
                    });
                  };
                  
                  // Get sort direction for a column
                  const getSortDirection = (column) => {
                    const sort = sortConfig.find((s) => s.column === column);
                    return sort ? sort.direction : null;
                  };
                  
                  // Get sort order (priority) for a column
                  const getSortOrder = (column) => {
                    const index = sortConfig.findIndex((s) => s.column === column);
                    return index >= 0 ? index + 1 : null;
                  };
                  
                  return (
                    <tr style={{ borderBottom: "2px solid #e1e3e5", backgroundColor: "#f6f6f7" }}>
                      <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: "600", borderRight: "1px solid #e1e3e5", width: "60px" }}>
                        Active
                      </th>
                      <th 
                        style={{ 
                          padding: "0.75rem", 
                          textAlign: "left", 
                          fontWeight: "600", 
                          borderRight: "1px solid #e1e3e5",
                          cursor: "pointer",
                          userSelect: "none",
                          position: "relative"
                        }}
                        onClick={() => handleSort('title')}
                      >
                        Title {getSortDirection('title') && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#667eea" }}>
                            {getSortDirection('title') === 'asc' ? '↑' : '↓'} {getSortOrder('title')}
                          </span>
                        )}
                      </th>
                      <th 
                        style={{ 
                          padding: "0.75rem", 
                          textAlign: "left", 
                          fontWeight: "600", 
                          borderRight: "1px solid #e1e3e5",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                        onClick={() => handleSort('position_id')}
                      >
                        Position {getSortDirection('position_id') && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#667eea" }}>
                            {getSortDirection('position_id') === 'asc' ? '↑' : '↓'} {getSortOrder('position_id')}
                          </span>
                        )}
                      </th>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: "600", borderRight: "1px solid #e1e3e5" }}>
                        Block Type
                      </th>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: "600", borderRight: "1px solid #e1e3e5" }}>
                        Desktop Banner
                      </th>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: "600", borderRight: "1px solid #e1e3e5" }}>
                        Mobile Banner
                      </th>
                      <th 
                        style={{ 
                          padding: "0.75rem", 
                          textAlign: "left", 
                          fontWeight: "600", 
                          borderRight: "1px solid #e1e3e5",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                        onClick={() => handleSort('start_at')}
                      >
                        Start At {getSortDirection('start_at') && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#667eea" }}>
                            {getSortDirection('start_at') === 'asc' ? '↑' : '↓'} {getSortOrder('start_at')}
                          </span>
                        )}
                      </th>
                      <th 
                        style={{ 
                          padding: "0.75rem", 
                          textAlign: "left", 
                          fontWeight: "600", 
                          borderRight: "1px solid #e1e3e5",
                          cursor: "pointer",
                          userSelect: "none"
                        }}
                        onClick={() => handleSort('end_at')}
                      >
                        End At {getSortDirection('end_at') && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#667eea" }}>
                            {getSortDirection('end_at') === 'asc' ? '↑' : '↓'} {getSortOrder('end_at')}
                          </span>
                        )}
                      </th>
                      <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: "600", borderRight: "1px solid #e1e3e5", width: "80px" }}>
                        Edit
                      </th>
                      <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: "600", width: "80px" }}>
                        Delete
                      </th>
                    </tr>
                  );
                })()}
              </thead>
              <tbody>
                {(() => {
                  // Sort entries based on sortConfig
                  const sortedEntries = [...initialEntries].sort((a, b) => {
                    // Pre-compute field maps once per comparison
                    const fieldMapA = Object.fromEntries((a.fields || []).map((f) => [f.key, f.value]));
                    const fieldMapB = Object.fromEntries((b.fields || []).map((f) => [f.key, f.value]));
                    
                    // Apply all active sorts in order
                    for (const sort of sortConfig) {
                      let valueA = fieldMapA[sort.column];
                      let valueB = fieldMapB[sort.column];
                      
                      // Handle date fields
                      if (sort.column === 'start_at' || sort.column === 'end_at') {
                        valueA = valueA ? new Date(valueA).getTime() : 0;
                        valueB = valueB ? new Date(valueB).getTime() : 0;
                      } else if (typeof valueA === 'string') {
                        valueA = valueA.toLowerCase();
                      }
                      if (typeof valueB === 'string') {
                        valueB = valueB.toLowerCase();
                      }
                      
                      // Handle null/undefined
                      if (valueA == null || valueA === '') valueA = '';
                      if (valueB == null || valueB === '') valueB = '';
                      
                      // Compare
                      let comparison = 0;
                      if (valueA < valueB) {
                        comparison = -1;
                      } else if (valueA > valueB) {
                        comparison = 1;
                      }
                      
                      // Apply direction - if values differ, return the comparison
                      // Otherwise continue to next sort criterion
                      if (comparison !== 0) {
                        return sort.direction === 'asc' ? comparison : -comparison;
                      }
                    }
                    // All sorts matched - items are equal
                    return 0;
                  });
                  
                  return sortedEntries.map((e) => {
                  const fieldMap = Object.fromEntries(
                    (e.fields || []).map((f) => [f.key, f.value]),
                  );
                  const referenceMap = Object.fromEntries(
                    (e.fields || []).map((f) => [f.key, f.reference]),
                  );
                  
                  let startDate = "Not set";
                  let endDate = "Not set";
                  let startDateUserTz = "";
                  let endDateUserTz = "";
                  try {
                    if (fieldMap.start_at) {
                      startDate = formatUTCForDisplay(fieldMap.start_at, storeTimeZone);
                      if (userTimeZone !== storeTimeZone) {
                        startDateUserTz = formatUTCForDisplay(fieldMap.start_at, userTimeZone);
                      }
                    }
                  } catch (e) {
                    console.error("Error parsing start date:", e);
                  }
                  try {
                    if (fieldMap.end_at) {
                      endDate = formatUTCForDisplay(fieldMap.end_at, storeTimeZone);
                      if (userTimeZone !== storeTimeZone) {
                        endDateUserTz = formatUTCForDisplay(fieldMap.end_at, userTimeZone);
                      }
                    }
                  } catch (e) {
                    console.error("Error parsing end date:", e);
                  }
                  
                  const desktopBanner = referenceMap.desktop_banner;
                  const mobileBanner = referenceMap.mobile_banner;
                  const desktopBannerUrl = desktopBanner?.image?.url || null;
                  const mobileBannerUrl = mobileBanner?.image?.url || null;
                  
                  // Get publishable status
                  const isActive = e.capabilities?.publishable?.status === "ACTIVE";
                  const toggleId = `${e.id}-status-toggle`;
                  
                  // Handler for toggle status
                  const handleToggleStatus = async () => {
                    const newStatus = isActive ? "DRAFT" : "ACTIVE";
                    try {
                      const response = await fetch(window.location.pathname, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          intent: "toggleStatus",
                          id: e.id,
                          status: newStatus,
                        }),
                        credentials: "include",
                      });
                      
                      const result = await response.json();
                      
                      if (result.success) {
                        revalidator.revalidate();
                      } else {
                        console.error("Failed to toggle status:", result.error);
                      }
                    } catch (err) {
                      console.error("Error toggling status:", err);
                    }
                  };
                  
                  return (
                    <tr key={e.id} style={{ borderBottom: "1px solid #e1e3e5" }}>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", textAlign: "center" }}>
                        <label 
                          htmlFor={toggleId}
                          style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            justifyContent: "center", 
                            cursor: "pointer",
                            position: "relative",
                            width: "44px",
                            height: "24px",
                          }}
                        >
                          <input
                            id={toggleId}
                            type="checkbox"
                            checked={isActive}
                            onChange={handleToggleStatus}
                            aria-label={isActive ? "Set entry to draft status" : "Set entry to active status"}
                            style={{
                              opacity: 0,
                              width: 0,
                              height: 0,
                              position: "absolute",
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              cursor: "pointer",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: isActive ? "#667eea" : "#c9cccf",
                              borderRadius: "24px",
                              transition: "background-color 0.2s",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                width: "1px",
                                height: "1px",
                                padding: 0,
                                margin: "-1px",
                                overflow: "hidden",
                                clip: "rect(0, 0, 0, 0)",
                                whiteSpace: "nowrap",
                                border: 0,
                              }}
                            >
                              {isActive ? "Set entry to draft" : "Set entry to active"}
                            </span>
                            <span
                              style={{
                                position: "absolute",
                                content: '""',
                                height: "18px",
                                width: "18px",
                                left: isActive ? "22px" : "3px",
                                bottom: "3px",
                                backgroundColor: "white",
                                borderRadius: "50%",
                                transition: "left 0.2s",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                              }}
                            />
                          </span>
                        </label>
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", fontWeight: "500" }}>
                        {fieldMap.title || "(untitled)"}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5" }}>
                        {positions.find((p) => p.handle === fieldMap.position_id)?.name || fieldMap.position_id || "-"}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", fontSize: "0.8125rem" }}>
                        {blockTypes[fieldMap.block_type || "hero"]?.label || fieldMap.block_type || "Hero"}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", fontSize: "0.8125rem", textAlign: "center" }}>
                        {desktopBannerUrl ? (
                          <img 
                            src={desktopBannerUrl} 
                            alt="Desktop banner" 
                            style={{ maxWidth: "100px", maxHeight: "60px", objectFit: "contain", border: "1px solid #e1e3e5", borderRadius: "4px" }}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", fontSize: "0.8125rem", textAlign: "center" }}>
                        {mobileBannerUrl ? (
                          <img 
                            src={mobileBannerUrl} 
                            alt="Mobile banner" 
                            style={{ maxWidth: "100px", maxHeight: "60px", objectFit: "contain", border: "1px solid #e1e3e5", borderRadius: "4px" }}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", fontSize: "0.8125rem", color: "#666" }}>
                        <div>{startDate}</div>
                        {startDateUserTz && (
                          <div style={{ fontSize: "0.75rem", color: "#6d7175", marginTop: "2px" }}>
                            In your timezone: {startDateUserTz}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", fontSize: "0.8125rem", color: "#666" }}>
                        <div>{endDate}</div>
                        {endDateUserTz && (
                          <div style={{ fontSize: "0.75rem", color: "#6d7175", marginTop: "2px" }}>
                            In your timezone: {endDateUserTz}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem", borderRight: "1px solid #e1e3e5", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEntry(e);
                            setEditModalOpen(true);
                          }}
                          style={{
                            fontSize: "0.8125rem",
                            color: "#667eea",
                            textDecoration: "underline",
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                            padding: 0,
                          }}
                        >
                          Edit
                        </button>
                      </td>
                      <td style={{ padding: "0.75rem", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEntry(e);
                            setDeleteModalOpen(true);
                          }}
                          style={{
                            fontSize: "0.8125rem",
                            color: "#d72c0d",
                            textDecoration: "underline",
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                            padding: 0,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* Positions Section */}
      <s-section>
        <h2 style={{ fontSize: "1.2rem", lineHeight: 1.1, margin: "0 0 10px 0" }}>Positions</h2>
        <p style={{ fontSize: "0.875rem", color: "#6d7175", margin: "0 0 1rem 0" }}>
          Positions are placement slots for scheduled content. Create positions here, then select them when creating entries and use the <strong>handle</strong> in your theme block settings.
        </p>
        <div style={{ overflowX: "auto", border: "1px solid #e1e3e5", borderRadius: "8px", marginBottom: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e1e3e5", backgroundColor: "#f6f6f7" }}>
                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: "600" }}>Name</th>
                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: "600" }}>Handle</th>
                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: "600" }}>Description</th>
                <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: "600", width: "120px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "0.75rem" }}>{p.name}</td>
                  <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                    <code style={{ backgroundColor: "#f0f0f0", padding: "2px 6px", borderRadius: "4px" }}>{p.handle}</code>
                  </td>
                  <td style={{ padding: "0.75rem", color: "#6d7175" }}>{p.description || "—"}</td>
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPositionEditTarget(p);
                        setPositionFormName(p.name);
                        setPositionFormDesc(p.description || "");
                        setPositionModalOpen(true);
                      }}
                      style={{ marginRight: "0.5rem", fontSize: "0.8125rem", color: "#667eea", cursor: "pointer", background: "none", border: "none", textDecoration: "underline" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPositionDeleteConfirm(p)}
                      style={{ fontSize: "0.8125rem", color: "#d72c0d", cursor: "pointer", background: "none", border: "none", textDecoration: "underline" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => {
            setPositionEditTarget(null);
            setPositionFormName("");
            setPositionFormDesc("");
            setPositionModalOpen(true);
          }}
          style={{
            padding: "0.5rem 0.75rem",
            border: "1px solid #008060",
            borderRadius: "4px",
            background: "#008060",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "600",
          }}
        >
          Add Position
        </button>
      </s-section>

      {/* Position Add/Edit Modal */}
      {positionModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
          onClick={(e) => e.target === e.currentTarget && setPositionModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "400px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.125rem" }}>{positionEditTarget ? "Edit Position" : "Add Position"}</h3>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Name</label>
              <input
                type="text"
                value={positionFormName}
                onChange={(e) => setPositionFormName(e.target.value)}
                placeholder="e.g. Homepage Banner"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "0.875rem", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Description (optional)</label>
              <input
                type="text"
                value={positionFormDesc}
                onChange={(e) => setPositionFormDesc(e.target.value)}
                placeholder="e.g. Main banner on homepage"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "0.875rem", boxSizing: "border-box" }}
              />
            </div>
            {positionEditTarget && (
              <p style={{ fontSize: "0.75rem", color: "#6d7175", marginBottom: "1rem" }}>
                Handle: <code style={{ backgroundColor: "#f0f0f0", padding: "2px 4px" }}>{positionEditTarget.handle}</code> (used in theme block)
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPositionModalOpen(false)}
                style={{ padding: "0.5rem 1rem", border: "1px solid #c9cccf", borderRadius: "4px", background: "white", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const name = positionFormName.trim();
                  if (!name) return;
                  const body = positionEditTarget
                    ? { intent: "positionUpdate", id: positionEditTarget.id, name, description: positionFormDesc.trim() || null }
                    : { intent: "positionCreate", name, description: positionFormDesc.trim() || null };
                  try {
                    const res = await fetch(window.location.pathname, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                      credentials: "include",
                    });
                    const data = await res.json();
                    if (data.success) {
                      setPositionModalOpen(false);
                      revalidator.revalidate();
                    } else {
                      alert(data.error || "Failed");
                    }
                  } catch (err) {
                    alert(err.message || "Failed");
                  }
                }}
                style={{ padding: "0.5rem 1rem", border: "none", borderRadius: "4px", background: "#008060", color: "white", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600" }}
              >
                {positionEditTarget ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Position Delete Confirmation */}
      {positionDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
          onClick={(e) => e.target === e.currentTarget && setPositionDeleteConfirm(null)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "1.5rem",
              maxWidth: "400px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.5rem 0" }}>Delete position?</h3>
            <p style={{ margin: "0 0 1rem 0", color: "#6d7175", fontSize: "0.875rem" }}>
              Delete &quot;{positionDeleteConfirm.name}&quot;? Entries using this position will need to be updated.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setPositionDeleteConfirm(null)}
                style={{ padding: "0.5rem 1rem", border: "1px solid #c9cccf", borderRadius: "4px", background: "white", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(window.location.pathname, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ intent: "positionDelete", id: positionDeleteConfirm.id }),
                      credentials: "include",
                    });
                    const data = await res.json();
                    if (data.success) {
                      setPositionDeleteConfirm(null);
                      revalidator.revalidate();
                    } else {
                      alert(data.error || "Failed");
                    }
                  } catch (err) {
                    alert(err.message || "Failed");
                  }
                }}
                style={{ padding: "0.5rem 1rem", border: "none", borderRadius: "4px", background: "#d72c0d", color: "white", cursor: "pointer", fontSize: "0.875rem", fontWeight: "600" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && selectedEntry && (
        <EditEntryModal
          entry={selectedEntry}
          mediaFiles={mediaFiles}
          videoFiles={loaderVideoFiles || []}
          blockTypes={blockTypes}
          positions={positions}
          storeTimeZone={storeTimeZone}
          userTimeZone={userTimeZone}
          userTimezoneOffset={userTimezoneOffset}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedEntry(null);
          }}
          onSuccess={() => {
            setEditModalOpen(false);
            setSelectedEntry(null);
            revalidator.revalidate();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && selectedEntry && (
        <DeleteEntryModal
          entry={selectedEntry}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedEntry(null);
          }}
          onSuccess={() => {
            setDeleteModalOpen(false);
            setSelectedEntry(null);
            revalidator.revalidate();
          }}
        />
      )}
    </s-page>
  );
}

// Edit Entry Modal Component
function EditEntryModal({ entry, mediaFiles = [], videoFiles = [], blockTypes = {}, positions = [], onClose, onSuccess, storeTimeZone = "UTC", userTimeZone, userTimezoneOffset }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editPreviewData, setEditPreviewData] = useState({});
  const [editPreviewViewport, setEditPreviewViewport] = useState("desktop");
  const editFormRef = useRef(null);
  const editPreviewDebounceRef = useRef(null);
  const baseId = useId();
  const titleInputId = `${baseId}-title`;
  const positionInputId = `${baseId}-position`;
  const startInputId = `${baseId}-start`;
  const endInputId = `${baseId}-end`;
  
  const fieldMap = Object.fromEntries(
    (entry.fields || []).map((f) => [f.key, f.value]),
  );
  const blockType = fieldMap.block_type || "hero";
  let typeConfig = {};
  try {
    if (fieldMap.type_config) {
      typeConfig = JSON.parse(fieldMap.type_config) || {};
    }
  } catch (_) {}
  
  const getDateTimeLocal = (isoDate) => formatUTCForDateTimeInput(isoDate, storeTimeZone);

  const readEditFormData = useCallback(() => {
    const form = editFormRef.current;
    if (!form) return {};
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string") data[k] = v;
    }
    return data;
  }, []);

  const updateEditPreview = useCallback(() => {
    setEditPreviewData(readEditFormData());
  }, [readEditFormData]);

  useEffect(() => {
    const t = setTimeout(updateEditPreview, 100);
    return () => clearTimeout(t);
  }, [entry?.id, blockType, updateEditPreview]);

  useEffect(() => {
    const id = setInterval(updateEditPreview, 400);
    return () => clearInterval(id);
  }, [updateEditPreview]);

  const handleEditFormInput = useCallback(() => {
    if (editPreviewDebounceRef.current) clearTimeout(editPreviewDebounceRef.current);
    editPreviewDebounceRef.current = setTimeout(updateEditPreview, 150);
  }, [updateEditPreview]);

  const buildUpdateData = (formData) => {
    const base = {
      id: entry.id,
      title: formData.get("title"),
      positionId: formData.get("position_id"),
      startAt: formData.get("start_at") || null,
      endAt: formData.get("end_at") || null,
      blockType,
      store_timezone: storeTimeZone,
      timezone: formData.get("timezone") || "",
      timezoneOffset: formData.get("timezone_offset") || "",
      cssClass: formData.get("css_class") || "",
      customCss: formData.get("custom_css") || "",
      imageHeight: formData.get("image_height") || "adapt_to_image",
      imageHeightMobile: formData.get("image_height_mobile") || "adapt_to_image",
      imageFit: formData.get("image_fit") || "cover",
      imageFitMobile: formData.get("image_fit_mobile") || "cover",
      buttonBgColor: formData.get("button_bg_color") || null,
      buttonTextColor: formData.get("button_text_color") || null,
      buttonBorderRadius: formData.get("button_border_radius") || null,
      buttonPaddingVertical: formData.get("button_padding_vertical") || null,
      buttonPaddingHorizontal: formData.get("button_padding_horizontal") || null,
      buttonFontSize: formData.get("button_font_size") || null,
      headlineFontSize: formData.get("headline_font_size") || null,
      descriptionFontSize: formData.get("description_font_size") || null,
      headlineColor: formData.get("headline_color") || null,
      descriptionColor: formData.get("description_color") || null,
      headlineColorBelow: formData.get("headline_color_below") || null,
      descriptionColorBelow: formData.get("description_color_below") || null,
      buttonBgColorBelow: formData.get("button_bg_color_below") || null,
      buttonTextColorBelow: formData.get("button_text_color_below") || null,
      textAlignment: formData.get("text_alignment") || null,
      verticalAlignment: formData.get("vertical_alignment") || null,
      mobileContentBelow: formData.get("mobile_content_below") === "on" || formData.get("mobile_content_below") === "true",
      overlayOpacity: formData.get("overlay_opacity") != null && formData.get("overlay_opacity") !== "" ? formData.get("overlay_opacity") : null,
      overlayColor: formData.get("overlay_color") || null,
    };
    if (blockType === "hero") {
      return {
        ...base,
        headline: formData.get("headline") || "",
        description: formData.get("description") || "",
        desktopBanner: formData.get("desktop_banner") || "",
        mobileBanner: formData.get("mobile_banner") || "",
        targetUrl: formData.get("target_url") || "",
        buttonText: formData.get("button_text") || "",
      };
    }
    if (blockType === "announcement_bar") {
      return {
        ...base,
        announcementText: formData.get("announcement_text") || "",
        announcementLink: formData.get("announcement_link") || "",
        announcementBgColor: formData.get("announcement_bg_color") || "#000000",
        announcementTextColor: formData.get("announcement_text_color") || "#ffffff",
      };
    }
    if (blockType === "collection_banner") {
      return {
        ...base,
        collectionHandle: formData.get("collection_handle") || "",
        collectionBannerImage: formData.get("collection_banner_image") || "",
        collectionHeadline: formData.get("collection_headline") || "",
        collectionDescription: formData.get("collection_description") || "",
        collectionButtonText: formData.get("collection_button_text") || "",
      };
    }
    if (blockType === "countdown_banner") {
      return {
        ...base,
        countdownTargetDate: formData.get("countdown_target_date") || null,
        countdownHeadline: formData.get("countdown_headline") || "",
        countdownSubtext: formData.get("countdown_subtext") || "",
        countdownBgImage: formData.get("countdown_bg_image") || "",
        countdownBgColor: formData.get("countdown_bg_color") || "#000000",
        countdownTextColor: formData.get("countdown_text_color") || "#ffffff",
        countdownTargetUrl: formData.get("countdown_target_url") || "",
        countdownButtonText: formData.get("countdown_button_text") || "",
      };
    }
    if (blockType === "image_with_text") {
      return {
        ...base,
        imageWithTextImage: formData.get("image_with_text_image") || "",
        imageWithTextHeadline: formData.get("image_with_text_headline") || "",
        imageWithTextDescription: formData.get("image_with_text_description") || "",
        imageWithTextButtonText: formData.get("image_with_text_button_text") || "",
        imageWithTextButtonLink: formData.get("image_with_text_button_link") || "",
        imageWithTextLayout: formData.get("image_with_text_layout") || "image_left",
      };
    }
    if (blockType === "background_video") {
      return {
        ...base,
        videoUrl: formData.get("video_url") || "",
        videoFile: formData.get("video_file") || "",
        videoHeadline: formData.get("video_headline") || "",
        videoDescription: formData.get("video_description") || "",
        videoButtonText: formData.get("video_button_text") || "",
        videoButtonLink: formData.get("video_button_link") || "",
      };
    }
    if (blockType === "promo_card") {
      return {
        ...base,
        promoCardImage: formData.get("promo_card_image") || "",
        promoCardTitle: formData.get("promo_card_title") || "",
        promoCardDescription: formData.get("promo_card_description") || "",
        promoCardCtaUrl: formData.get("promo_card_cta_url") || "",
        promoCardCtaText: formData.get("promo_card_cta_text") || "",
      };
    }
    return base;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    const formData = new FormData(e.target);
    const updateData = buildUpdateData(formData);
    
    try {
      const response = await fetch(window.location.pathname, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "update",
          ...updateData,
        }),
        credentials: "include",
      });
      
      const result = await response.json();
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Failed to update entry");
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err.message || "Failed to update entry");
      setIsSubmitting(false);
    }
  };
  
  return (
    <div
      role="presentation"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit entry"
        tabIndex={-1}
            className={`edit-modal-dialog${MODAL_LAYOUT === "stacked" ? " edit-modal-stacked" : ""}`}
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "900px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      >
        <style>{`
          .edit-modal-dialog .edit-modal-body { display: flex; flex-direction: row; flex: 1; min-height: 0; }
          .edit-modal-dialog .edit-modal-preview { flex: 0 0 60%; padding: 0; border-right: 1px solid #e1e3e5; display: flex; flex-direction: column; min-width: 0; overflow-y: auto; }
          .edit-modal-dialog .edit-modal-data { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem; }
          .edit-modal-dialog .edit-modal-data .data-field-row { flex-direction: column; }
          .edit-modal-dialog.edit-modal-stacked .edit-modal-body { flex-direction: column; }
          .edit-modal-dialog.edit-modal-stacked .edit-modal-preview { flex: 0 0 auto; border-right: none; border-bottom: 1px solid #e1e3e5; }
          @media (max-width: 768px) {
            .edit-modal-dialog .edit-modal-body { flex-direction: column; }
            .edit-modal-dialog .edit-modal-preview { flex: 0 0 auto; border-right: none; border-bottom: 1px solid #e1e3e5; }
          }
        `}</style>
        <div style={{ padding: "1.5rem", borderBottom: "1px solid #e1e3e5", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "600" }}>Edit Entry</h2>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: "#666",
              }}
            >
              ×
            </button>
          </div>
        </div>
        <form ref={editFormRef} onSubmit={handleSubmit} onInput={handleEditFormInput} style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
          <div className="edit-modal-body">
            <div className="edit-modal-preview">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 0.75rem 1.5rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6d7175", textTransform: "uppercase" }}>Preview</span>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  <button
                    type="button"
                    onClick={() => setEditPreviewViewport("desktop")}
                    style={{
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      border: "1px solid #c9cccf",
                      borderRadius: "4px",
                      background: editPreviewViewport === "desktop" ? "#e1e3e5" : "white",
                      cursor: "pointer",
                      fontWeight: editPreviewViewport === "desktop" ? 600 : 400,
                    }}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPreviewViewport("mobile")}
                    style={{
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      border: "1px solid #c9cccf",
                      borderRadius: "4px",
                      background: editPreviewViewport === "mobile" ? "#e1e3e5" : "white",
                      cursor: "pointer",
                      fontWeight: editPreviewViewport === "mobile" ? 600 : 400,
                    }}
                  >
                    Mobile
                  </button>
                </div>
              </div>
              <BlockPreview
                blockType={blockType}
                data={editPreviewData}
                mediaFiles={mediaFiles}
                videoFiles={videoFiles}
                variant="pane"
                viewport={editPreviewViewport}
              />
            </div>
            <div className="edit-modal-data">
          {error && (
            <div style={{ padding: "0.75rem", marginBottom: "1rem", backgroundColor: "#fee", color: "#d72c0d", borderRadius: "4px" }}>
              {error}
            </div>
          )}
          <input type="hidden" name="store_timezone" value={storeTimeZone} readOnly />
          <input type="hidden" name="timezone" value={userTimeZone ?? "UTC"} readOnly />
          <input type="hidden" name="timezone_offset" value={userTimezoneOffset ?? 0} readOnly />
          <p style={{ margin: "0 0 1rem 0", fontSize: "0.8125rem", color: "#6d7175" }}>
            Times are in store timezone ({storeTimeZone}).{userTimeZone !== storeTimeZone && (
              <> In your timezone ({userTimeZone}): times will differ.</>
            )}
          </p>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor={titleInputId} style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
              Title <span style={{ color: "#d72c0d" }}>*</span>
            </label>
            <input
              type="text"
              id={titleInputId}
              name="title"
              defaultValue={fieldMap.title || ""}
              required
              style={{
                width: "100%",
                padding: "0.5rem",
                border: "1px solid #c9cccf",
                borderRadius: "4px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor={positionInputId} style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
              Position <span style={{ color: "#d72c0d" }}>*</span>
            </label>
            <select
              id={positionInputId}
              name="position_id"
              required
              defaultValue={fieldMap.position_id || ""}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }}
            >
              <option value="">Select position...</option>
              {positions.map((p) => (
                <option key={p.id} value={p.handle}>
                  {p.name}{p.description ? ` — ${p.description}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#f6f6f7", borderRadius: "4px", fontSize: "0.875rem" }}>
            Block type: <strong>{blockTypes[blockType]?.label || blockType}</strong>
          </div>
          <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "1rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor={startInputId} style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Start Date & Time</label>
              <input type="datetime-local" id={startInputId} name="start_at" defaultValue={getDateTimeLocal(fieldMap.start_at)} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor={endInputId} style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>End Date & Time</label>
              <input type="datetime-local" id={endInputId} name="end_at" defaultValue={getDateTimeLocal(fieldMap.end_at)} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
            </div>
          </div>
          {blockType === "hero" && (
            <>
              <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "1rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MediaLibraryPicker name="desktop_banner" label="Desktop Banner" mediaFiles={mediaFiles} defaultValue={fieldMap.desktop_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MediaLibraryPicker name="mobile_banner" label="Mobile Banner" mediaFiles={mediaFiles} defaultValue={fieldMap.mobile_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
                </div>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Headline</label>
                <input type="text" name="headline" defaultValue={fieldMap.headline || typeConfig.headline || ""} placeholder="Headline" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Description</label>
                <input type="text" name="description" defaultValue={fieldMap.description || typeConfig.description || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Target URL</label>
                <input type="text" name="target_url" defaultValue={fieldMap.target_url || typeConfig.target_url || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Text</label>
                <input type="text" name="button_text" defaultValue={fieldMap.button_text || typeConfig.button_text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
            </>
          )}
          {blockType === "announcement_bar" && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Message</label>
                <input type="text" name="announcement_text" required defaultValue={typeConfig.text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Link URL</label>
                <input type="text" name="announcement_link" defaultValue={typeConfig.link || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "1rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Background Color</label>
                  <input type="color" name="announcement_bg_color" defaultValue={typeConfig.bg_color || "#000000"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Text Color</label>
                  <input type="color" name="announcement_text_color" defaultValue={typeConfig.text_color || "#ffffff"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                </div>
              </div>
            </>
          )}
          {blockType === "collection_banner" && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Collection Handle</label>
                <input type="text" name="collection_handle" required defaultValue={typeConfig.collection_handle || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <MediaLibraryPicker name="collection_banner_image" label="Banner Image (optional)" mediaFiles={mediaFiles} defaultValue={fieldMap.desktop_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Headline Override</label>
                <input type="text" name="collection_headline" defaultValue={typeConfig.headline || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Description</label>
                <input type="text" name="collection_description" defaultValue={typeConfig.description || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Text</label>
                <input type="text" name="collection_button_text" defaultValue={typeConfig.button_text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
            </>
          )}
          {blockType === "countdown_banner" && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Target Date & Time</label>
                <input type="datetime-local" name="countdown_target_date" required defaultValue={getDateTimeLocal(typeConfig.target_date)} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Headline</label>
                <input type="text" name="countdown_headline" defaultValue={typeConfig.headline || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Subtext</label>
                <input type="text" name="countdown_subtext" defaultValue={typeConfig.subtext || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <MediaLibraryPicker name="countdown_bg_image" label="Background Image" mediaFiles={mediaFiles} defaultValue={fieldMap.desktop_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
              <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "1rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Background Color</label>
                  <input type="color" name="countdown_bg_color" defaultValue={typeConfig.background_color || "#000000"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Text Color</label>
                  <input type="color" name="countdown_text_color" defaultValue={typeConfig.text_color || "#ffffff"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                </div>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Link URL</label>
                <input type="text" name="countdown_target_url" defaultValue={typeConfig.target_url || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Text</label>
                <input type="text" name="countdown_button_text" defaultValue={typeConfig.button_text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
            </>
          )}
          {blockType === "image_with_text" && (
            <>
              <MediaLibraryPicker name="image_with_text_image" label="Image" mediaFiles={mediaFiles} defaultValue={fieldMap.desktop_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Headline</label>
                <input type="text" name="image_with_text_headline" defaultValue={typeConfig.headline || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Description</label>
                <input type="text" name="image_with_text_description" defaultValue={typeConfig.description || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Text</label>
                <input type="text" name="image_with_text_button_text" defaultValue={typeConfig.button_text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Link</label>
                <input type="text" name="image_with_text_button_link" defaultValue={typeConfig.button_link || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Layout</label>
                <select name="image_with_text_layout" defaultValue={typeConfig.layout || "image_left"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                  <option value="image_left">Image Left</option>
                  <option value="image_right">Image Right</option>
                </select>
              </div>
            </>
          )}
          {blockType === "background_video" && (
            <>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Video URL (hosted)</label>
                <input type="text" name="video_url" defaultValue={typeConfig.video_url || ""} placeholder="https://..." style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <MediaLibraryPicker name="video_file" label="Or video from Shopify" mediaFiles={videoFiles} defaultValue={fieldMap.desktop_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Headline</label>
                <input type="text" name="video_headline" defaultValue={typeConfig.headline || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Description</label>
                <input type="text" name="video_description" defaultValue={typeConfig.description || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Text</label>
                <input type="text" name="video_button_text" defaultValue={typeConfig.button_text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Button Link</label>
                <input type="text" name="video_button_link" defaultValue={typeConfig.button_link || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
            </>
          )}
          {blockType === "promo_card" && (
            <>
              <MediaLibraryPicker name="promo_card_image" label="Image" mediaFiles={mediaFiles} defaultValue={fieldMap.desktop_banner || ""} onSelect={() => setTimeout(updateEditPreview, 50)} />
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Title</label>
                <input type="text" name="promo_card_title" defaultValue={typeConfig.title || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>Description</label>
                <input type="text" name="promo_card_description" defaultValue={typeConfig.description || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>CTA Link</label>
                <input type="text" name="promo_card_cta_url" defaultValue={typeConfig.cta_url || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>CTA Text</label>
                <input type="text" name="promo_card_cta_text" defaultValue={typeConfig.cta_text || ""} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
              </div>
            </>
          )}
          {["hero", "collection_banner", "countdown_banner", "image_with_text", "background_video", "promo_card"].includes(blockType) && (
            <>
              <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f0f4f8", borderRadius: "4px" }}>
                <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Image / Video</p>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Height (Desktop)</label>
                    <select name="image_height" defaultValue={typeConfig.image_height || "adapt_to_image"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                      <option value="adapt_to_image">Adapt to image (exact proportions, width 100%)</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="full_screen">Full screen</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Height (Mobile)</label>
                    <select name="image_height_mobile" defaultValue={typeConfig.image_height_mobile || "adapt_to_image"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                      <option value="adapt_to_image">Adapt to image (exact proportions, width 100%)</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="full_screen">Full screen</option>
                    </select>
                  </div>
                </div>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Fit (Desktop)</label>
                    <select name="image_fit" defaultValue={typeConfig.image_fit || "cover"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                      <option value="fill">Fill</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Fit (Mobile)</label>
                    <select name="image_fit_mobile" defaultValue={typeConfig.image_fit_mobile || "cover"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                      <option value="fill">Fill</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #e1e3e5" }}>
                  <p style={{ margin: "0 0 0.5rem 0", fontWeight: "500", fontSize: "0.8125rem" }}>Overlay (0 = off)</p>
                  <div className="data-field-row" style={{ display: "flex", gap: "15px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Opacity (0-100)</label>
                      <input type="number" name="overlay_opacity" min={0} max={100} defaultValue={typeConfig.overlay_opacity ?? ""} placeholder="70" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Color</label>
                      <input type="color" name="overlay_color" defaultValue={typeConfig.overlay_color || "#000000"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f0f4f8", borderRadius: "4px" }}>
                <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Button</p>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Background</label>
                    <input type="color" name="button_bg_color" defaultValue={typeConfig.button_bg_color || "#ffffff"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Text Color</label>
                    <input type="color" name="button_text_color" defaultValue={typeConfig.button_text_color || "#667eea"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                </div>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Border radius (px)</label>
                    <input type="number" name="button_border_radius" defaultValue={typeConfig.button_border_radius ?? 6} placeholder="6" min={0} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Padding vertical (px)</label>
                    <input type="number" name="button_padding_vertical" defaultValue={typeConfig.button_padding_vertical ?? typeConfig.button_padding ?? 12} placeholder="12" min={0} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Padding horizontal (px)</label>
                    <input type="number" name="button_padding_horizontal" defaultValue={typeConfig.button_padding_horizontal ?? typeConfig.button_padding ?? 24} placeholder="24" min={0} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Font size (em)</label>
                    <input type="number" name="button_font_size" defaultValue={typeConfig.button_font_size ?? 1} placeholder="1" step={0.1} min={0.5} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f0f4f8", borderRadius: "4px" }}>
                <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Text</p>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Headline size (em)</label>
                    <input type="number" name="headline_font_size" defaultValue={typeConfig.headline_font_size ?? ""} placeholder="1.5" step={0.1} min={0.5} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Description size (em)</label>
                    <input type="number" name="description_font_size" defaultValue={typeConfig.description_font_size ?? ""} placeholder="0.9" step={0.1} min={0.5} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Headline color</label>
                    <input type="color" name="headline_color" defaultValue={typeConfig.headline_color || "#ffffff"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Description color</label>
                    <input type="color" name="description_color" defaultValue={typeConfig.description_color || "#ffffff"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Alignment</label>
                    <select name="text_alignment" defaultValue={typeConfig.text_alignment || "left"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  {blockType === "hero" && (
                    <>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Content position</label>
                        <select name="vertical_alignment" defaultValue={typeConfig.vertical_alignment || "bottom"} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px" }}>
                          <option value="top">Top</option>
                          <option value="center">Center</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", paddingBottom: "0.5rem" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: "500", fontSize: "0.8125rem" }}>
                          <input type="checkbox" name="mobile_content_below" value="on" defaultChecked={typeConfig.mobile_content_below === true || typeConfig.mobile_content_below === "true"} style={{ width: "18px", height: "18px" }} />
                          Show content below image on mobile
                        </label>
                      </div>
                    </>
                  )}
                </div>
                <p style={{ margin: "0.5rem 0 0.25rem 0", fontSize: "0.75rem", color: "#6d7175" }}>When content below image (mobile):</p>
                <div className="data-field-row" style={{ display: "flex", gap: "15px", marginBottom: "0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Headline color</label>
                    <input type="color" name="headline_color_below" defaultValue={typeConfig.headline_color_below || "#2c3e50"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Description color</label>
                    <input type="color" name="description_color_below" defaultValue={typeConfig.description_color_below || "#666666"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Button bg</label>
                    <input type="color" name="button_bg_color_below" defaultValue={typeConfig.button_bg_color_below || "#667eea"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Button text</label>
                    <input type="color" name="button_text_color_below" defaultValue={typeConfig.button_text_color_below || "#ffffff"} style={{ width: "100%", height: "36px", border: "1px solid #c9cccf", borderRadius: "4px" }} />
                  </div>
                </div>
              </div>
            </>
          )}
          <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f6f6f7", borderRadius: "4px" }}>
            <p style={{ margin: "0 0 0.5rem 0", fontWeight: "600", fontSize: "0.875rem" }}>Styling</p>
            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>CSS Class</label>
              <input type="text" name="css_class" defaultValue={typeConfig.css_class || ""} placeholder="e.g. my-custom-banner" style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.8125rem" }}>Custom CSS</label>
              <textarea name="custom_css" defaultValue={typeConfig.custom_css || ""} placeholder=".my-custom-banner .scheduled-banner__button { border-radius: 20px; }" rows={4} style={{ width: "100%", padding: "0.5rem", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "0.8125rem", fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #c9cccf",
                borderRadius: "4px",
                backgroundColor: "white",
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "4px",
                backgroundColor: "#667eea",
                color: "white",
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
            >
              {isSubmitting ? "Updating..." : "Update Entry"}
            </button>
          </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete Confirmation Modal Component
function DeleteEntryModal({ entry, onClose, onSuccess }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  
  const fieldMap = Object.fromEntries(
    (entry.fields || []).map((f) => [f.key, f.value]),
  );
  
  const handleDelete = async () => {
    setIsDeleting(true);
    setError("");
    
    try {
      const response = await fetch(window.location.pathname, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "delete",
          id: entry.id,
        }),
        credentials: "include",
      });
      
      const result = await response.json();
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "Failed to delete entry");
        setIsDeleting(false);
      }
    } catch (err) {
      setError(err.message || "Failed to delete entry");
      setIsDeleting(false);
    }
  };
  
  return (
    <div
      role="presentation"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete entry confirmation"
        tabIndex={-1}
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "500px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div style={{ padding: "1.5rem", borderBottom: "1px solid #e1e3e5" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "600" }}>Delete Entry</h2>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: "#666",
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div style={{ padding: "1.5rem" }}>
          {error && (
            <div style={{ padding: "0.75rem", marginBottom: "1rem", backgroundColor: "#fee", color: "#d72c0d", borderRadius: "4px" }}>
              {error}
            </div>
          )}
          <p style={{ margin: "0 0 1rem 0" }}>
            Are you sure you want to delete <strong>{fieldMap.title || "(untitled)"}</strong>? This action cannot be undone.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              style={{
                padding: "0.5rem 1rem",
                border: "1px solid #c9cccf",
                borderRadius: "4px",
                backgroundColor: "white",
                cursor: isDeleting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                padding: "0.5rem 1rem",
                border: "none",
                borderRadius: "4px",
                backgroundColor: "#d72c0d",
                color: "white",
                cursor: isDeleting ? "not-allowed" : "pointer",
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaLibraryPicker({ name, label, mediaFiles = [], defaultValue = "", onSelect }) {
  const [selectedFileId, setSelectedFileId] = useState(defaultValue);
  const [showPicker, setShowPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [localMediaFiles, setLocalMediaFiles] = useState(mediaFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const hiddenInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const revalidator = useRevalidator();
  const triggerId = useId();

  const selectedFile = localMediaFiles.find((f) => f.id === selectedFileId);

  useEffect(() => {
    setLocalMediaFiles((prev) => {
      const fromLoader = new Map(mediaFiles.map((f) => [f.id, f]));
      const merged = [...mediaFiles];
      for (const f of prev) {
        if (!fromLoader.has(f.id)) merged.unshift(f);
      }
      return merged;
    });
  }, [mediaFiles]);

  const handleSelectFile = (fileId) => {
    setSelectedFileId(fileId);
    setShowPicker(false);
    setSearchTerm("");
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = fileId;
    }
    onSelect?.(fileId);
  };

  const filteredFiles = localMediaFiles.filter((file) =>
    (file.alt || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (file.url || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    debugLog("[MediaLibraryPicker] File selected:", file?.name, "Size:", file?.size, "Type:", file?.type);

    if (!file) {
      debugLog("[MediaLibraryPicker] No file selected");
      return;
    }

    if (!file.type.startsWith("image/")) {
      debugLog("[MediaLibraryPicker] Invalid file type:", file.type);
      setUploadError("Please upload an image file");
      return;
    }

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    setUploadProgress(0);

    progressIntervalRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 500);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      debugLog("[MediaLibraryPicker] FormData created, submitting...");
      debugLog("[MediaLibraryPicker] Submitting FormData with file:", file.name, "Size:", file.size, "Type:", file.type);

      const uploadStartTime = Date.now();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Upload timeout: Request took longer than 60 seconds")), 60000);
      });
      const fetchPromise = fetch(window.location.pathname, {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      const uploadDuration = Date.now() - uploadStartTime;

      debugLog("[MediaLibraryPicker] Upload response received after", uploadDuration, "ms, status:", response.status);

      const contentType = response.headers.get("content-type") || "";
      debugLog("[MediaLibraryPicker] Response content-type:", contentType);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[MediaLibraryPicker] Upload failed with status:", response.status);
        console.error("[MediaLibraryPicker] Response content-type:", contentType);
        console.error("[MediaLibraryPicker] Error response (first 500 chars):", errorText.substring(0, 500));
        if (contentType.includes("text/html")) {
          throw new Error(`Server returned HTML error page (${response.status}). The request may not have reached the action handler.`);
        }
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      if (!contentType.includes("application/json")) {
        const responseText = await response.text();
        console.error("[MediaLibraryPicker] Expected JSON but got:", contentType);
        console.error("[MediaLibraryPicker] Response (first 500 chars):", responseText.substring(0, 500));
        throw new Error(`Server returned ${contentType} instead of JSON. Response may be an error page.`);
      }

      const result = await response.json();
      debugLog("[MediaLibraryPicker] Upload response data:", result);

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      setUploadProgress(100);
      setIsUploading(false);

      setTimeout(() => {
        if (result && typeof result === "object" && result.success && result.file) {
          const newFile = {
            id: result.file.id,
            url: result.file.url,
            alt: result.file.alt || "Uploaded image",
            createdAt: result.file.createdAt || new Date().toISOString(),
          };
          debugLog("[MediaLibraryPicker] Upload successful, file:", newFile);
          setLocalMediaFiles((prev) => [newFile, ...prev]);
          setSelectedFileId(newFile.id);
          if (hiddenInputRef.current) {
            hiddenInputRef.current.value = newFile.id;
          }
          onSelect?.(newFile.id);
          setUploadError("");
          setUploadSuccess(true);
          revalidator.revalidate();

          setTimeout(() => {
            setShowPicker(false);
            setUploadSuccess(false);
            setUploadProgress(0);
          }, 1500);
        } else {
          const errorMessage = result?.error || result?.message || "Failed to upload file";
          console.error("[MediaLibraryPicker] Upload error:", errorMessage);
          console.error("[MediaLibraryPicker] Full result:", JSON.stringify(result, null, 2));
          setUploadError(errorMessage);
          setUploadProgress(0);
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }, 300);
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      console.error("[MediaLibraryPicker] Error uploading file:", error);
      console.error("[MediaLibraryPicker] Error name:", error.name);
      console.error("[MediaLibraryPicker] Error message:", error.message);
      console.error("[MediaLibraryPicker] Error stack:", error.stack);

      let errorMessage = "Failed to upload file. Please try again.";
      if (error.message?.includes("timeout")) {
        errorMessage = "Upload timed out. The file may be too large or the server is taking too long to process it.";
      } else if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setUploadError(errorMessage);
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  useEffect(() => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = selectedFileId;
    }
  }, [selectedFileId]);

  return (
    <>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={triggerId} style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          {label}
        </label>
        <button
          type="button"
          id={triggerId}
          onClick={() => {
            setShowPicker(true);
            setUploadError("");
            setUploadSuccess(false);
            setUploadProgress(0);
          }}
          style={{
            width: "100%",
            padding: "0.5rem",
            border: "1px solid #c9cccf",
            borderRadius: "4px",
            fontSize: "0.875rem",
            backgroundColor: "#f6f6f7",
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{selectedFile ? `Selected: ${selectedFile.alt || "Image"}` : `Select ${label} from media library`}</span>
          <span style={{ color: "#666", fontSize: "0.75rem" }}>Browse →</span>
        </button>
        <input type="hidden" ref={hiddenInputRef} name={name} value={selectedFileId} />
        {selectedFile && (selectedFile.url || selectedFile.id) && (
          <div style={{ marginTop: "0.5rem" }}>
            {selectedFile.type === "video" ? (
              <div
                style={{
                  maxWidth: "200px",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  backgroundColor: "#f6f6f7",
                  fontSize: "0.875rem",
                  color: "#6d7175",
                }}
              >
                Video selected
              </div>
            ) : (
              <img
                src={selectedFile.url}
                alt={selectedFile.alt || ""}
                style={{
                  maxWidth: "200px",
                  maxHeight: "150px",
                  objectFit: "contain",
                  border: "1px solid #c9cccf",
                  borderRadius: "4px",
                  padding: "0.25rem",
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedFileId("");
                if (hiddenInputRef.current) {
                  hiddenInputRef.current.value = "";
                }
              }}
              style={{
                marginTop: "0.25rem",
                padding: "0.25rem 0.5rem",
                fontSize: "0.75rem",
                color: "#d72c0d",
                border: "none",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {showPicker && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Close ${label} picker`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowPicker(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setShowPicker(false);
              return;
            }
            if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
              event.preventDefault();
              setShowPicker(false);
            }
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Select ${label}`}
            tabIndex={-1}
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{ padding: "1.5rem", borderBottom: "1px solid #e1e3e5" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "600" }}>Select {label}</h2>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "1.5rem",
                    cursor: "pointer",
                    color: "#666",
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <input
                  type="text"
                  placeholder="Search images..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    border: "1px solid #c9cccf",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid #008060",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                    backgroundColor: "#008060",
                    color: "white",
                    cursor: isUploading ? "not-allowed" : "pointer",
                    opacity: isUploading ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isUploading ? "Uploading..." : "Upload Image"}
                </button>
              </div>
              {isUploading && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <div
                    style={{
                      padding: "0.5rem",
                      backgroundColor: "#f0f9f6",
                      border: "1px solid #008060",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                      <span style={{ color: "#008060", fontWeight: "500" }}>Uploading... {uploadProgress}%</span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        backgroundColor: "#e1e3e5",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${uploadProgress}%`,
                          height: "100%",
                          backgroundColor: "#008060",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {uploadSuccess && (
                <div
                  style={{
                    padding: "0.5rem",
                    backgroundColor: "#d4edda",
                    border: "1px solid #c3e6cb",
                    borderRadius: "4px",
                    color: "#155724",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  ✓ File uploaded successfully!
                </div>
              )}
              {uploadError && (
                <div
                  style={{
                    padding: "0.5rem",
                    backgroundColor: "#fee",
                    border: "1px solid #fcc",
                    borderRadius: "4px",
                    color: "#c00",
                    fontSize: "0.875rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  ✗ {uploadError}
                </div>
              )}
            </div>
            <div
              style={{
                padding: "1.5rem",
                overflowY: "auto",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "1rem",
              }}
            >
              {filteredFiles.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "2rem", color: "#666" }}>
                  {localMediaFiles.length === 0 ? "No images found in media library" : "No images match your search"}
                </div>
              ) : (
                filteredFiles.map((file) => (
                  <button
                    type="button"
                    key={file.id}
                    onClick={() => handleSelectFile(file.id)}
                    aria-pressed={selectedFileId === file.id}
                    style={{
                      cursor: "pointer",
                      border: selectedFileId === file.id ? "2px solid #008060" : "1px solid #c9cccf",
                      borderRadius: "4px",
                      padding: "0.5rem",
                      backgroundColor: selectedFileId === file.id ? "#f0f9f6" : "white",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <img
                      src={file.url}
                      alt={file.alt || ""}
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        objectFit: "cover",
                        borderRadius: "4px",
                        marginBottom: "0.5rem",
                      }}
                    />
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#666",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.alt || "Untitled"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const mediaFileShape = PropTypes.shape({
  id: PropTypes.string.isRequired,
  url: PropTypes.string,
  alt: PropTypes.string,
  image: PropTypes.shape({
    url: PropTypes.string,
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
});

MediaLibraryPicker.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  mediaFiles: PropTypes.arrayOf(mediaFileShape),
  defaultValue: PropTypes.string,
};

EditEntryModal.propTypes = {
  entry: PropTypes.shape({
    id: PropTypes.string.isRequired,
    fields: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string,
        value: PropTypes.string,
        reference: PropTypes.object,
      }),
    ),
  }).isRequired,
  mediaFiles: PropTypes.arrayOf(mediaFileShape),
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
  userTimeZone: PropTypes.string,
  userTimezoneOffset: PropTypes.number,
};

DeleteEntryModal.propTypes = {
  entry: PropTypes.shape({
    id: PropTypes.string.isRequired,
    fields: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string,
        value: PropTypes.string,
      }),
    ),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// Add error boundary to catch and handle errors properly
export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[ErrorBoundary] Error caught:", error);
  
  // Use Shopify's default error boundary
  return boundary.error(error);
}
