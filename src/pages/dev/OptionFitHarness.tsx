import { OptionGrid } from "@/components/game/OptionGrid";

export default function OptionFitHarness() {
  const options = ["", "", "", ""]; // media-only
  const optionMedia = [
    // Exact 16:9 -> should be cover
    { type: 'image', url: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#ddd"/></svg>'), width: 1600, height: 900 },
    // Square -> should switch to contain
    { type: 'image', url: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ddd"/></svg>'), width: 1000, height: 1000 },
    // Portrait -> should switch to contain
    { type: 'image', url: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 16"><rect width="9" height="16" fill="#ddd"/></svg>'), width: 900, height: 1600 },
    // Video override: force contain regardless of intrinsic metadata
    { type: 'video', url: 'data:video/mp4;base64,', fitMode: 'contain' },
  ] as any[];

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">OptionGrid smart-fit harness</h1>
      <OptionGrid
        options={options}
        onSelect={() => { /* dev harness: no-op by design */ }}
        optionMedia={optionMedia}
        itemId={123}
        clusterId="e2e"
        variant="h1"
      />
    </div>
  );
}
