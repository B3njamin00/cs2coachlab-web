export default function ProgressCard() {
  return (
    <div className="rounded-2xl bg-slate-900 p-6">
      <h2 className="text-2xl font-bold">
        Fremgang mot 25k
      </h2>

      <div className="mt-4 h-5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-cyan-500"
          style={{ width: "48%" }}
        />
      </div>

      <p className="mt-3 text-slate-400">
        48% av målet nådd
      </p>
    </div>
  );
}