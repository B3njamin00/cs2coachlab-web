export default function MatchList() {
  return (
    <div className="rounded-2xl bg-slate-900 p-6">
      <h2 className="mb-4 text-2xl font-bold">
        Siste Kamper
      </h2>

      <div className="space-y-4">
        <div className="flex justify-between">
          <span>Mirage</span>
          <span className="text-green-400">
            +115 ELO
          </span>
        </div>

        <div className="flex justify-between">
          <span>Inferno</span>
          <span className="text-red-400">
            -92 ELO
          </span>
        </div>

        <div className="flex justify-between">
          <span>Dust2</span>
          <span className="text-green-400">
            +121 ELO
          </span>
        </div>
      </div>
    </div>
  );
}