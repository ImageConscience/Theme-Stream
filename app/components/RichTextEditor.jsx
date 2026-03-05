import { useRef, useEffect } from "react";
import PropTypes from "prop-types";

/**
 * Rich text editor for headlines and descriptions.
 * Uses contenteditable with a simple toolbar (bold, italic, H1, H2).
 * Outputs HTML. Syncs to a hidden input for form submission.
 */
export default function RichTextEditor({ name, value = "", placeholder, onChange, minHeight = 80 }) {
  const editorRef = useRef(null);
  const hiddenRef = useRef(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    const el = editorRef.current;
    const hidden = hiddenRef.current;
    if (!el || isInternalChange.current) return;
    const normalized = (value || "").trim();
    const current = el.innerHTML.trim();
    if (normalized && current !== normalized) {
      el.innerHTML = normalized;
      if (hidden) hidden.value = normalized;
    } else if (!normalized && current !== "" && current !== "<br>") {
      el.innerHTML = "";
      if (hidden) hidden.value = "";
    } else if (hidden && hidden.value !== (value || "")) {
      hidden.value = value || "";
    }
  }, [value]);

  const handleInput = () => {
    const el = editorRef.current;
    const hidden = hiddenRef.current;
    if (!el || !hidden) return;
    isInternalChange.current = true;
    const html = el.innerHTML;
    if (hidden.value !== html) {
      hidden.value = html;
      hidden.dispatchEvent(new Event("input", { bubbles: true }));
    }
    onChange?.(html);
    isInternalChange.current = false;
  };

  const execCmd = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    handleInput();
  };

  return (
    <div style={{ border: "1px solid #c9cccf", borderRadius: "4px", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          gap: "2px",
          padding: "4px 6px",
          backgroundColor: "#f6f6f7",
          borderBottom: "1px solid #c9cccf",
        }}
      >
        <button type="button" onClick={() => execCmd("bold")} title="Bold" style={btnStyle}>
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => execCmd("italic")} title="Italic" style={btnStyle}>
          <em>I</em>
        </button>
        <button type="button" onClick={() => execCmd("formatBlock", "h1")} title="Heading 1" style={btnStyle}>
          H1
        </button>
        <button type="button" onClick={() => execCmd("formatBlock", "h2")} title="Heading 2" style={btnStyle}>
          H2
        </button>
        <button type="button" onClick={() => execCmd("formatBlock", "p")} title="Paragraph" style={btnStyle}>
          P
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        data-placeholder={placeholder}
        onInput={handleInput}
        suppressContentEditableWarning
        style={{
          minHeight,
          padding: "0.5rem",
          outline: "none",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          boxSizing: "border-box",
        }}
      />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={value || ""} />
    </div>
  );
}

const btnStyle = {
  padding: "4px 8px",
  border: "1px solid #c9cccf",
  borderRadius: "4px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "0.75rem",
};

RichTextEditor.propTypes = {
  name: PropTypes.string.isRequired,
  value: PropTypes.string,
  placeholder: PropTypes.string,
  onChange: PropTypes.func,
  minHeight: PropTypes.number,
};
