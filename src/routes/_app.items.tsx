import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchFactories, fetchSections, fetchItems, fetchSaudas } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { List, Pencil, Check, X, Search } from "lucide-react";
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
  const [localSaudaMap, setLocalSaudaMap] = useState<Record<string, string>>({});
  const [isEditingGauges, setIsEditingGauges] = useState(false);
  const [tempGauges, setTempGauges] = useState<Record<string, string>>({});

  // Helper to calculate pending qty for sauda display
  const getSaudaDetails = (s: any) => {
    const itemsTotal = (s.sauda_items ?? []).reduce((a: number, r: any) => a + Number(r.qty || 0), 0);
    const total = Number(s.total_qty || 0) || itemsTotal;
    const pending = Math.max(0, total - Number(s.lifted_qty || 0));
    return { pending, basic: s.sauda_basic, party: s.party_name };
  };

  const updateGaugesMut = useMutation({
    mutationFn: async () => {
      for (const [id, val] of Object.entries(tempGauges)) {
        await supabase.from("items").update({ gauge_diff: Number(val) }).eq("id", id);
      }
    },
    onSuccess: () => {
      toast.success("Gauges Updated");
      setIsEditingGauges(false);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const grouped = useMemo(() => {
    if (!sections.data || !items.data || !factories.data) return [];
    const fmap = new Map(factories.data.map((f) => [f.id, f]));
    const smap = new Map((saudas.data || []).map((s: any) => [s.id, s]));

    return sections.data.map((s) => {
      const f = fmap.get(s.factory_id);
      const baseToday = (f?.basic_rate ?? 0) + Number(s.adder);
      
      const selectedSaudaId = localSaudaMap[s.id];
      const selectedSauda = selectedSaudaId ? smap.get(selectedSaudaId) : null;
      const baseSauda = selectedSauda ? Number(selectedSauda.sauda_basic) + Number(s.adder) : null;
      const baseParty = Number(s.party_basic);

      const rows = items.data!.filter((i) => i.section_id === s.id && (!q || i.name.toLowerCase().includes(q.toLowerCase())))
        .map((i) => ({
          ...i,
          today: baseToday + Number(i.gauge_diff),
          sauda: baseSauda === null ? null : baseSauda + Number(i.gauge_diff),
          party: baseParty + Number(i.gauge_diff),
        }));
      
      return { section: s, factory: f, selectedSauda, rows };
    }).filter((g) => g.rows.length > 0);
  }, [factories.data, sections.data, items.data, saudas.data, localSaudaMap, q]);

  return (
    <div className="space-y-4 pb-20">
      {/* Top Search bar */}
      <div className="sticky top-[53px] z-40 bg-background/95 backdrop-blur border-b py-3 px-4 flex items-center justify-between gap-4 -mx-4 sm:mx-0 sm:rounded-xl sm:border shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditingGauges(!isEditingGauges)}>
            {isEditingGauges ? "Cancel" : "Edit Gauges"}
          </Button>
          {isEditingGauges && <Button size="sm" className="bg-green-600" onClick={() => updateGaugesMut.mutate()}>Save</Button>}
        </div>
      </div>

      {grouped.map(({ section, factory, selectedSauda, rows }) => {
        const saudaInfo = selectedSauda ? getSaudaDetails(selectedSauda) : null;
        
        return (
          <Card key={section.id} className="overflow-visible border-none shadow-none sm:border sm:shadow-sm mb-8">
            {/* STICKY SECTION HEADER MATCHING IMAGE */}
            <CardHeader className="sticky top-[107px] z-30 bg-white border-y py-3 px-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-baseline gap-2 overflow-hidden">
                  <h3 className="font-bold text-lg whitespace-nowrap uppercase">{section.name}</h3>
                  <span className="text-xs text-muted-foreground truncate">
                    ({factory?.name} {factory?.basic_rate} + {section.adder} adder
                    {saudaInfo ? ` · sauda ${saudaInfo.basic} from ${saudaInfo.party} (${saudaInfo.pending} pending)` : " · no sauda selected"})
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-muted-foreground">Sauda:</span>
                  <Select 
                    value={localSaudaMap[section.id] || "none"} 
                    onValueChange={(v) => setLocalSaudaMap(p => ({...p, [section.id]: v}))}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-[280px] bg-background">
                      <SelectValue placeholder="Select Sauda..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-red-500">-- None --</SelectItem>
                      {saudas.data?.filter((s: any) => s.status !== "done").map((s: any) => {
                        const d = getSaudaDetails(s);
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {d.party} — basic {d.basic} ({d.pending} pending)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-visible">
              <table className="w-full text-sm border-collapse">
                {/* STICKY COLUMN NAMES */}
                <thead className="sticky top-[164px] z-20 hidden sm:table-header-group bg-slate-50/80 backdrop-blur border-b">
                  <tr className="text-left text-muted-foreground font-semibold">
                    <th className="p-3">Item</th>
                    <th className="p-3 text-right">Gauge Diff</th>
                    <th className="p-3 text-right">Today's Rate</th>
                    <th className="p-3 text-right">Sauda Rate</th>
                    <th className="p-3 text-right">Party Rate</th>
                    <th className="p-3 text-right">Available Qty</th>
                    <th className="p-3 text-right">Last Purchase</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30 font-medium">
                      <td className="p-3">{r.name}</td>
                      <td className="p-3 text-right">
                        {isEditingGauges ? (
                          <Input className="h-7 w-16 ml-auto text-right text-xs" type="number" 
                            value={tempGauges[r.id] ?? r.gauge_diff}
                            onChange={(e) => setTempGauges({ ...tempGauges, [r.id]: e.target.value })} />
                        ) : (
                          <span className="text-muted-foreground">{r.gauge_diff > 0 ? `+${r.gauge_diff}` : r.gauge_diff}</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">{r.today.toFixed(0)}</td>
                      <td className="p-3 text-right font-mono font-bold text-orange-600">{r.sauda?.toFixed(0) ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{r.party.toFixed(0)}</td>
                      <td className="p-3 text-right tabular-nums">{Number(r.available_qty).toFixed(2)}</td>
                      <td className="p-3 text-right text-xs text-muted-foreground truncate max-w-[100px]">{r.last_purchase_rate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
