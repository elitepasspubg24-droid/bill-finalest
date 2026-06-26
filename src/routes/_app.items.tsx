import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchFactories, fetchSections, fetchItems, fetchSaudas } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { List, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/items")({
  component: ItemsPage,
});

function ItemsPage() {
  const qc = useQueryClient();
  const factories = useQuery({ queryKey: ["factories"], queryFn: fetchFactories });
  const sections = useQuery({ queryKey: ["sections"], queryFn: fetchSections });
  const items = useQuery({ queryKey: ["items"], queryFn: fetchItems });
  const saudas = useQuery({ queryKey: ["saudas"], queryFn: fetchSaudas });
  
  const [q, setQ] = useState("");
  const [selectedSaudaId, setSelectedSaudaId] = useState<string>("none");
  const [isEditingGauges, setIsEditingGauges] = useState(false);
  const [tempGauges, setTempGauges] = useState<Record<string, string>>({});

  const activeSaudaBasic = useMemo(() => {
    if (selectedSaudaId === "none" || !saudas.data) return null;
    const s = (saudas.data as any[]).find(x => x.id === selectedSaudaId);
    return s ? Number(s.sauda_basic) : null;
  }, [selectedSaudaId, saudas.data]);

  const updateGaugesMut = useMutation({
    mutationFn: async () => {
      for (const [id, val] of Object.entries(tempGauges)) {
        const { error } = await supabase.from("items").update({ gauge_diff: Number(val) }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Gauges updated");
      setIsEditingGauges(false);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    if (!sections.data || !items.data || !factories.data) return [];
    const fmap = new Map(factories.data.map((f) => [f.id, f]));
    return sections.data.map((s) => {
      const f = fmap.get(s.factory_id);
      const baseToday = (f?.basic_rate ?? 0) + Number(s.adder);
      const baseSauda = activeSaudaBasic !== null ? activeSaudaBasic + Number(s.adder) : null;
      const baseParty = Number(s.party_basic);
      const rows = items.data!.filter((i) => i.section_id === s.id && (!q || i.name.toLowerCase().includes(q.toLowerCase())))
        .map((i) => ({
          ...i,
          today: baseToday + Number(i.gauge_diff),
          sauda: baseSauda === null ? null : baseSauda + Number(i.gauge_diff),
          party: baseParty + Number(i.gauge_diff),
        }));
      return { section: s, factory: f, rows };
    }).filter((g) => g.rows.length > 0);
  }, [factories.data, sections.data, items.data, activeSaudaBasic, q]);

  return (
    <div className="space-y-4">
      {/* STICKY CONTROL BAR */}
      <div className="sticky top-[53px] z-30 bg-background/95 backdrop-blur border-b py-3 -mx-4 px-4 sm:mx-0 sm:rounded-xl sm:border shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Rates</h2>
          <Select value={selectedSaudaId} onValueChange={setSelectedSaudaId}>
            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Apply Sauda..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-- Current Daily Rates --</SelectItem>
              {saudas.data?.filter((s: any) => s.status !== "done").map((s: any) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">{s.party_name} — {s.sauda_basic}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} className="w-32 h-8 text-sm" />
          <Button variant="outline" size="sm" className="h-8" onClick={() => setIsEditingGauges(!isEditingGauges)}>
            {isEditingGauges ? "Cancel" : "Edit Gauges"}
          </Button>
          {isEditingGauges && <Button size="sm" className="h-8" onClick={() => updateGaugesMut.mutate()}>Save</Button>}
        </div>
      </div>

      {grouped.map(({ section, factory, rows }) => (
        <Card key={section.id} id={`section-${section.id}`} className="overflow-visible border-none sm:border shadow-none sm:shadow-sm">
          {/* STICKY SECTION HEADER */}
          <CardHeader className="sticky top-[115px] z-20 bg-muted py-2 px-4 border-y">
            <CardTitle className="text-xs font-bold flex justify-between uppercase">
              <span>{section.name} | {factory?.name}</span>
              <span className="opacity-60">Base: {(factory?.basic_rate ?? 0) + Number(section.adder)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm border-collapse">
              {/* STICKY COLUMN HEADERS */}
              <thead className="sticky top-[148px] z-10 hidden sm:table-header-group bg-background border-b">
                <tr className="text-[10px] text-muted-foreground uppercase font-bold text-left">
                  <th className="p-3">Item Description</th>
                  <th className="p-3 text-right">Gauge Diff</th>
                  <th className="p-3 text-right text-primary">Today's Rate</th>
                  <th className="p-3 text-right text-orange-600">Sauda Rate</th>
                  <th className="p-3 text-right">Party Rate</th>
                  <th className="p-3 text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-right">
                      {isEditingGauges ? (
                        <Input className="h-7 w-16 ml-auto text-right text-xs" type="number" value={tempGauges[r.id] ?? r.gauge_diff}
                          onChange={(e) => setTempGauges({ ...tempGauges, [r.id]: e.target.value })} />
                      ) : (r.gauge_diff)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-primary">{r.today.toFixed(0)}</td>
                    <td className="p-3 text-right font-mono font-bold text-orange-600">{r.sauda?.toFixed(0) ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{r.party.toFixed(0)}</td>
                    <td className="p-3 text-right tabular-nums">{r.available_qty.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
