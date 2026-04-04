import React, { useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import type { TeamStats, HeadToHeadResult } from "../../../server/analytics";

interface ComparisonReportPDFProps {
  result: HeadToHeadResult;
  className?: string;
}

function getOddsColor(odds: number): string {
  if (odds >= 60) return "#10B981";
  if (odds >= 40) return "#F59E0B";
  return "#EF4444";
}

function advLabel(adv: "A" | "B" | "tie", teamA: string, teamB: string): { text: string; color: string } {
  if (adv === "A") return { text: `${teamA} leads`, color: "#EF4444" };
  if (adv === "B") return { text: `${teamB} leads`, color: "#3B82F6" };
  return { text: "Tied", color: "#9CA3AF" };
}

function StatRow({ label, valA, valB, advantage }: {
  label: string;
  valA: string | number;
  valB: string | number;
  advantage: "A" | "B" | "tie";
}) {
  return (
    <tr>
      <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: "700", color: advantage === "A" ? "#EF4444" : "#6B7280", fontSize: "12px", borderBottom: "1px solid #F3F4F6" }}>{valA}</td>
      <td style={{ padding: "7px 10px", textAlign: "center", fontSize: "11px", color: "#374151", borderBottom: "1px solid #F3F4F6", fontWeight: "600" }}>{label}</td>
      <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: "700", color: advantage === "B" ? "#3B82F6" : "#6B7280", fontSize: "12px", borderBottom: "1px solid #F3F4F6" }}>{valB}</td>
    </tr>
  );
}

function TeamCard({ stats, color, winProb }: { stats: TeamStats; color: string; winProb: number }) {
  return (
    <div style={{ flex: 1, backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "16px", border: `2px solid ${color}22` }}>
      <div style={{ fontSize: "10px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Team</div>
      <div style={{ fontSize: "24px", fontWeight: "800", color }}>
        {stats.teamNumber}
      </div>
      {stats.teamName && <div style={{ fontSize: "13px", color: "#374151", marginTop: "2px" }}>{stats.teamName}</div>}
      {stats.organization && <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{stats.organization}</div>}
      <div style={{ marginTop: "12px" }}>
        <div style={{ fontSize: "10px", color: "#9CA3AF", marginBottom: "2px" }}>Win Probability</div>
        <div style={{ fontSize: "28px", fontWeight: "800", color: getOddsColor(winProb) }}>{winProb.toFixed(1)}%</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
        {[
          { label: "Skills Rank", value: stats.skillsRank ? `#${stats.skillsRank}` : "—" },
          { label: "Total Skills", value: stats.skillsScore ?? "—" },
          { label: "Driver", value: stats.driverScore ?? "—" },
          { label: "Auto", value: stats.autoScore ?? "—" },
          { label: "Win Rate", value: `${(stats.winRate * 100).toFixed(1)}%` },
          { label: "Avg Score", value: stats.avgAllianceScore.toFixed(1) },
        ].map((item) => (
          <div key={item.label} style={{ backgroundColor: "#ffffff", borderRadius: "6px", padding: "8px", border: "1px solid #E5E7EB" }}>
            <div style={{ fontSize: "9px", color: "#9CA3AF", textTransform: "uppercase" }}>{item.label}</div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "#111827" }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComparisonReportPDF({ result, className }: ComparisonReportPDFProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = React.useState(false);

  const handleExport = async () => {
    if (!reportRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`VEX-IQ-${result.teamA.teamNumber}-vs-${result.teamB.teamNumber}-Comparison.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  const { breakdown, factors } = result;

  const rows = [
    { label: "Driver Skills", valA: result.teamA.driverScore ?? "—", valB: result.teamB.driverScore ?? "—", adv: breakdown.driverSkillsAdvantage },
    { label: "Auto Skills", valA: result.teamA.autoScore ?? "—", valB: result.teamB.autoScore ?? "—", adv: breakdown.autoSkillsAdvantage },
    { label: "Total Skills", valA: result.teamA.skillsScore ?? "—", valB: result.teamB.skillsScore ?? "—", adv: breakdown.totalSkillsAdvantage },
    { label: "Avg Match Score", valA: result.teamA.avgAllianceScore.toFixed(1), valB: result.teamB.avgAllianceScore.toFixed(1), adv: breakdown.avgTeamworkScoreAdvantage },
    { label: "Skills Rank", valA: result.teamA.skillsRank ? `#${result.teamA.skillsRank}` : "—", valB: result.teamB.skillsRank ? `#${result.teamB.skillsRank}` : "—", adv: breakdown.rankAdvantage },
  ] as const;

  const winner = result.teamAWinProbability > result.teamBWinProbability
    ? result.teamA
    : result.teamBWinProbability > result.teamAWinProbability
      ? result.teamB
      : null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={generating}
        className={className}
      >
        {generating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {generating ? "Generating PDF…" : "Export Comparison"}
      </Button>

      {/* Hidden printable report */}
      <div
        ref={reportRef}
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          width: "794px",
          backgroundColor: "#ffffff",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          color: "#111827",
          padding: "40px",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: "3px solid #EF4444", paddingBottom: "16px", marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
            VEX IQ Championship Predictor
          </div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: "#111827" }}>
            Head-to-Head Comparison Report
          </div>
          <div style={{ fontSize: "16px", color: "#374151", marginTop: "4px" }}>
            <span style={{ color: "#EF4444", fontWeight: "700" }}>{result.teamA.teamNumber}</span>
            <span style={{ color: "#9CA3AF", margin: "0 8px" }}>vs</span>
            <span style={{ color: "#3B82F6", fontWeight: "700" }}>{result.teamB.teamNumber}</span>
          </div>
          <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "6px" }}>
            Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>

        {/* Winner callout */}
        {winner && (
          <div style={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #86EFAC",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}>
            <div style={{ fontSize: "20px" }}>🏆</div>
            <div>
              <div style={{ fontSize: "12px", color: "#166534", fontWeight: "700" }}>Predicted Winner</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: winner === result.teamA ? "#EF4444" : "#3B82F6" }}>
                {winner.teamNumber}{winner.teamName ? ` — ${winner.teamName}` : ""}
              </div>
              <div style={{ fontSize: "11px", color: "#166534" }}>
                {winner === result.teamA ? result.teamAWinProbability.toFixed(1) : result.teamBWinProbability.toFixed(1)}% win probability
              </div>
            </div>
          </div>
        )}

        {/* Team cards side by side */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
          <TeamCard stats={result.teamA} color="#EF4444" winProb={result.teamAWinProbability} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px" }}>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#D1D5DB" }}>VS</div>
          </div>
          <TeamCard stats={result.teamB} color="#3B82F6" winProb={result.teamBWinProbability} />
        </div>

        {/* Win Probability Bar */}
        <div style={{ marginBottom: "24px", backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "16px", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
            Win Probability
          </div>
          <div style={{ display: "flex", height: "20px", borderRadius: "10px", overflow: "hidden", border: "1px solid #E5E7EB" }}>
            <div style={{ width: `${result.teamAWinProbability}%`, backgroundColor: "#EF4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {result.teamAWinProbability > 20 && (
                <span style={{ color: "#fff", fontSize: "10px", fontWeight: "700" }}>{result.teamAWinProbability.toFixed(1)}%</span>
              )}
            </div>
            <div style={{ width: `${result.teamBWinProbability}%`, backgroundColor: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {result.teamBWinProbability > 20 && (
                <span style={{ color: "#fff", fontSize: "10px", fontWeight: "700" }}>{result.teamBWinProbability.toFixed(1)}%</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px" }}>
            <span style={{ color: "#EF4444", fontWeight: "600" }}>{result.teamA.teamNumber}</span>
            <span style={{ color: "#3B82F6", fontWeight: "600" }}>{result.teamB.teamNumber}</span>
          </div>
        </div>

        {/* Stats comparison table */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
            Stat-by-Stat Breakdown
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#F3F4F6" }}>
                <th style={{ padding: "8px 10px", textAlign: "center", color: "#EF4444", fontWeight: "700", fontSize: "12px", borderBottom: "2px solid #E5E7EB", width: "35%" }}>
                  {result.teamA.teamNumber}
                </th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: "#374151", fontWeight: "600", fontSize: "11px", borderBottom: "2px solid #E5E7EB", width: "30%" }}>
                  Metric
                </th>
                <th style={{ padding: "8px 10px", textAlign: "center", color: "#3B82F6", fontWeight: "700", fontSize: "12px", borderBottom: "2px solid #E5E7EB", width: "35%" }}>
                  {result.teamB.teamNumber}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StatRow key={row.label} label={row.label} valA={row.valA} valB={row.valB} advantage={row.adv} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Factor weights */}
        <div style={{ marginBottom: "24px", backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "16px", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
            Prediction Model Weights
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {[
              { label: "Driver Skills", weight: factors.driverSkillsWeight },
              { label: "Auto Skills", weight: factors.autoSkillsWeight },
              { label: "Avg Match Score", weight: factors.avgTeamworkScoreWeight },
              { label: "Skills Rank", weight: factors.rankWeight },
              { label: "Total Skills", weight: factors.totalSkillsWeight },
            ].map((f) => (
              <div key={f.label} style={{ backgroundColor: "#ffffff", borderRadius: "6px", padding: "8px 12px", border: "1px solid #E5E7EB", textAlign: "center" }}>
                <div style={{ fontSize: "9px", color: "#9CA3AF", textTransform: "uppercase" }}>{f.label}</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#111827" }}>{(f.weight * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "10px", color: "#9CA3AF" }}>
            VEX IQ Championship Predictor · Data sourced from RobotEvents API
          </div>
          <div style={{ fontSize: "10px", color: "#9CA3AF" }}>
            2025–2026 Season
          </div>
        </div>
      </div>
    </>
  );
}
