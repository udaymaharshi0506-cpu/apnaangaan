export default function Loading() {
  return (
    <div
      aria-label="Loading page content"
      style={{
        minHeight: "65vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "3px solid var(--border, #e5e9e3)",
          borderTopColor: "var(--brand, #164f4c)",
          borderRadius: "50%",
          animation: "spin 0.75s linear infinite",
        }}
      />
    </div>
  );
}

