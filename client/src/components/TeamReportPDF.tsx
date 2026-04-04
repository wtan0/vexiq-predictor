import React, { useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import type { TeamStats, SeasonProgressPoint } from "../../../server/analytics";

interface TeamReportPDFProps {
  stats: TeamStats;
  progress: SeasonProgressPoint[];
  className?: string;
}

function getMedalColor(rank: number | null): string {
  if (rank === 1) return "#F59E0B";
  if (rank === 2) return "#9CA3AF";
  if (rank === 3) return "#B45309";
  return "#3B82F6";
}

function getMedalLabel(rank: number | null): string {
  if (rank === 1) return "🥇 Champion";
  if (rank === 2) return "🥈 Runner-up";
  if (rank === 3) return "🥉 3rd Place";
  if (rank) return `#${rank}`;
  return "—";
}

function getOddsColor(odds: number): string {
  if (odds >= 70) return "#10B981";
  if (odds >= 40) return "#F59E0B";
  return "#EF4444";
}

export function TeamReportPDF({ stats, progress, className }: TeamReportPDFProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = React.useState(false);

  const finalistEvents = progress.filter((p) => p.finalistRank !== null);

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
      pdf.save(`VEX-IQ-${stats.teamNumber}-Report.pdf`);
    } finally {
      setGenerating(false);
    }
  };

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
        {generating ? "Generating PDF…" : "Export Report"}
      </Button>

      {/* Hidden printable report — rendered off-screen, captured by html2canvas */}
      <div
        ref={reportRef}
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          width: "794px", // A4 at 96dpi
          backgroundColor: "#ffffff",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          color: "#111827",
          padding: "40px",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ borderBottom: "3px solid #EF4444", paddingBottom: "16px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                VEX IQ Championship Predictor
              </div>
              <div style={{ fontSize: "28px", fontWeight: "800", color: "#111827" }}>
                Team {stats.teamNumber}
              </div>
              {stats.teamName && (
                <div style={{ fontSize: "16px", color: "#374151", marginTop: "2px" }}>{stats.teamName}</div>
              )}
              {stats.organization && (
                <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "2px" }}>{stats.organization}</div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px" }}>World Finals Odds</div>
              <div style={{ fontSize: "36px", fontWeight: "800", color: getOddsColor(stats.worldFinalsOdds) }}>
                {stats.worldFinalsOdds.toFixed(1)}%
              </div>
              <div style={{ fontSize: "11px", color: "#6B7280" }}>
                Composite: {stats.compositeScore.toFixed(1)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#9CA3AF" }}>
            Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            {stats.country ? ` · ${stats.country}` : ""}
            {stats.eventRegion ? ` · ${stats.eventRegion}` : ""}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
            Performance Overview
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {[
              { label: "Skills Rank", value: stats.skillsRank ? `#${stats.skillsRank}` : "—", sub: "Global" },
              { label: "Total Skills", value: stats.skillsScore ?? "—", sub: "Combined" },
              { label: "Driver Skills", value: stats.driverScore ?? "—", sub: "Score" },
              { label: "Auto Skills", value: stats.autoScore ?? "—", sub: "Score" },
              { label: "Win Rate", value: `${(stats.winRate * 100).toFixed(1)}%`, sub: `${stats.wins}W / ${stats.losses}L` },
              { label: "Avg Alliance", value: stats.avgAllianceScore.toFixed(1), sub: "Per match" },
              { label: "Total Events", value: stats.totalEvents, sub: "Competed" },
              { label: "Best Event Rank", value: stats.bestEventRank ? `#${stats.bestEventRank}` : "—", sub: "All events" },
            ].map((item) => (
              <div key={item.label} style={{ backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "12px", border: "1px solid #E5E7EB" }}>
                <div style={{ fontSize: "10px", color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.label}</div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#111827", margin: "4px 0 2px" }}>{item.value}</div>
                <div style={{ fontSize: "10px", color: "#9CA3AF" }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Win Probability Bar */}
        <div style={{ marginBottom: "24px", backgroundColor: "#F9FAFB", borderRadius: "8px", padding: "16px", border: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
            World Finals Win Probability
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ flex: 1, height: "16px", backgroundColor: "#E5E7EB", borderRadius: "8px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(stats.worldFinalsOdds, 100)}%`,
                backgroundColor: getOddsColor(stats.worldFinalsOdds),
                borderRadius: "8px",
                transition: "width 0.3s",
              }} />
            </div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: getOddsColor(stats.worldFinalsOdds), minWidth: "52px", textAlign: "right" }}>
              {stats.worldFinalsOdds.toFixed(1)}%
            </div>
          </div>
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#6B7280" }}>
            Based on skills score (40%), win rate (30%), event ranking (20%), and consistency (10%)
          </div>
        </div>

        {/* Finalist Rank History */}
        {finalistEvents.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
              Playoff / Finalist History
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ backgroundColor: "#F3F4F6" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Event</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Date</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Finalist Rank</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Final Score</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Skills Score</th>
                </tr>
              </thead>
              <tbody>
                {finalistEvents.map((ev, i) => (
                  <tr key={ev.eventCode ?? i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#F9FAFB" }}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #F3F4F6", color: "#111827" }}>{ev.eventName}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#6B7280" }}>
                      {ev.eventDate ? new Date(ev.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #F3F4F6" }}>
                      <span style={{ color: getMedalColor(ev.finalistRank), fontWeight: "700" }}>
                        {getMedalLabel(ev.finalistRank)}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#111827", fontWeight: "600" }}>
                      {ev.finalistScore ?? "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#111827" }}>
                      {ev.skillsScore ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Season Progress Table */}
        {progress.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
              Season Event History
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ backgroundColor: "#F3F4F6" }}>
                  <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Event</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Date</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Driver</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Auto</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Skills</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Rank</th>
                  <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: "600", color: "#374151", borderBottom: "1px solid #E5E7EB" }}>Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((ev, i) => (
                  <tr key={ev.eventCode ?? i} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#F9FAFB" }}>
                    <td style={{ padding: "6px 10px", borderBottom: "1px solid #F3F4F6", color: "#111827", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.eventName}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#6B7280" }}>
                      {ev.eventDate ? new Date(ev.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#111827" }}>{ev.driverScore ?? "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#111827" }}>{ev.autoScore ?? "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", fontWeight: "600", color: "#111827" }}>{ev.skillsScore ?? "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#374151" }}>
                      {ev.eventRank ? `#${ev.eventRank}` : "—"}
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid #F3F4F6", color: "#374151" }}>
                      {ev.avgMatchScore ? ev.avgMatchScore.toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "10px", color: "#9CA3AF" }}>
            VEX IQ Championship Predictor · Data sourced from RobotEvents API
          </div>
          <div style={{ fontSize: "10px", color: "#9CA3AF" }}>
            {stats.lastSyncedAt
              ? `Last synced: ${new Date(stats.lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : "Data not yet synced"}
          </div>
        </div>
      </div>
    </>
  );
}
