import { useEffect, useRef, useState, useId } from "react";
import { useRevalidator } from "react-router";

const isDev =
  (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "production") || typeof import.meta === "undefined";
const debugLog = (...args) => isDev && console.log(...args);

export default function MediaLibraryPicker({ name, label, mediaFiles = [], defaultValue = "", onSelect }) {
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

  useEffect(() => setLocalMediaFiles(mediaFiles), [mediaFiles]);
  useEffect(() => {
    if (hiddenInputRef.current) hiddenInputRef.current.value = selectedFileId;
  }, [selectedFileId]);

  const handleSelectFile = (fileId) => {
    setSelectedFileId(fileId);
    setShowPicker(false);
    setSearchTerm("");
    if (hiddenInputRef.current) hiddenInputRef.current.value = fileId;
    onSelect?.(fileId);
  };

  const filteredFiles = localMediaFiles.filter(
    (file) =>
      (file.alt || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (file.url || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload an image file");
      return;
    }
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    setUploadProgress(0);
    progressIntervalRef.current = setInterval(
      () => setUploadProgress((p) => (p >= 90 ? p : p + 10)),
      500,
    );

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const response = await Promise.race([
        fetch(window.location.pathname, { method: "POST", body: uploadFormData, credentials: "include" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timeout")), 60000)),
      ]);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      if (!contentType.includes("application/json")) throw new Error("Server returned non-JSON");
      const result = await response.json();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setUploadProgress(100);
      setIsUploading(false);
      setTimeout(() => {
        if (result?.success && result?.file) {
          const newFile = {
            id: result.file.id,
            url: result.file.url,
            alt: result.file.alt || "Uploaded image",
            createdAt: result.file.createdAt || new Date().toISOString(),
            type: "image",
          };
          setLocalMediaFiles((prev) => [newFile, ...prev]);
          setSelectedFileId(newFile.id);
          if (hiddenInputRef.current) hiddenInputRef.current.value = newFile.id;
          onSelect?.(newFile.id);
          setUploadError("");
          setUploadSuccess(true);
          revalidator.revalidate();
          setTimeout(() => { setShowPicker(false); setUploadSuccess(false); setUploadProgress(0); }, 1500);
        } else {
          setUploadError(result?.error || result?.message || "Failed to upload file");
          setUploadProgress(0);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 300);
    } catch (error) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setUploadError(error.message || "Failed to upload file");
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={triggerId} style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          {label}
        </label>
        <button
          type="button"
          id={triggerId}
          onClick={() => { setShowPicker(true); setUploadError(""); setUploadSuccess(false); setUploadProgress(0); }}
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
              onClick={() => { setSelectedFileId(""); if (hiddenInputRef.current) hiddenInputRef.current.value = ""; }}
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
              Clear selection
            </button>
          </div>
        )}
      </div>
      {showPicker && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0 }}>Select {label}</h3>
              <button type="button" onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer" }}>×</button>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", marginBottom: "1rem", border: "1px solid #c9cccf", borderRadius: "4px" }}
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileUpload}
              style={{ marginBottom: "1rem" }}
            />
            {uploadError && <div style={{ color: "#d72c0d", marginBottom: "0.5rem" }}>{uploadError}</div>}
            {uploadSuccess && <div style={{ color: "#008060", marginBottom: "0.5rem" }}>Uploaded!</div>}
            {isUploading && <div style={{ marginBottom: "0.5rem" }}>Uploading... {uploadProgress}%</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.5rem" }}>
              {filteredFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => handleSelectFile(file.id)}
                  style={{
                    padding: "0.25rem",
                    border: selectedFileId === file.id ? "2px solid #008060" : "1px solid #c9cccf",
                    borderRadius: "4px",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  {file.type === "video" ? (
                    <div style={{ height: "80px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem" }}>Video</div>
                  ) : (
                    <img src={file.url} alt={file.alt || ""} style={{ width: "100%", height: "80px", objectFit: "cover" }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
