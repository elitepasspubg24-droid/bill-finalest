import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchFactories, fetchSections, fetchItems, fetchSaudas } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Check, X, Search } from "lucide-react";
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
  // localSaudaMap stores: { [sectionId]: selectedSaudaId }
  const [localSaudaMap, setLocalSaudaMap] = useState<Record<string, string>>({});
  const [isEditingGauges, setIsEditingGauges] = useState(false);
  const [tempGauges, setTempGauges] = useState<Record<string, string>>({});

  const updateGaugesMut = useMutation({
    mutationFn: async () => {
      for (const [id, val] of Object.entries(tempGauges)) {
        await supabase.from("items").update({ gauge_diff: Number(val) }).eq("id", id);
      }
    },
    onSuccess: () => {
      toast.success("Gauge Differences updated");
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
      
      // Look up Sauda Rate based on what is selected for THIS specific section
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
      return { section: s, factory: f, rows };
    }).filter((g) => g.rows.length > 0);
  }, [factories.data, sections.data, items.data, saudas.data, localSaudaMap, q]);

  return (
    <div className="space-y-6 pb-20">
      {/* Search & Edit Gauges Bar - Stays at top under main nav */}
      <div className="sticky top-[53px] z-40 bg-background/95 backdrop-blur py-3 border-b flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search all items..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-10" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditingGauges(!isEditingGauges)}>
            {isEditingGauges ? "Cancel" : "Edit Gauges"}
          </Button>
          {isEditingGauges && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updateGaugesMut.mutate()}>
              Save All
            </Button>
          )}
        </div>
      </div>

      {grouped.map(({ section, factory, rows }) => (
        <Card key={section.id} id={`section-${section.id}`} className="overflow-visible border-none shadow-none sm:border sm:shadow-sm">
          
          {/* CATEGORY HEADER: Sticks below the Search Bar */}
          <CardHeader className="sticky top-[110px] z-30 bg-slate-100 dark:bg-slate-900 py-3 px-4 border-y">
            <CardTitle className="text-sm font-bold flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-tight">{section.name}</span>
                <span className="text-[10px] font-normal text-muted-foreground">({factory?.name} @ {factory?.basic_rate})</span>
              </div>

              {/* INDIVIDUAL SAUDA PICKER FOR THIS CATEGORY */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Sauda:</span>
                <Select 
                  value={localSaudaMap[section.id] || "none"} 
                  onValueChange={(val) => setLocalSaudaMap(prev => ({...prev, [section.id]: val}))}
                >
                  <SelectTrigger className="h-7 w-[220px] text-[10px] bg-background">
                    <SelectValue placeholder="Select Sauda..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs text-red-500">None (Show Today's)</SelectItem>
                    {saudas.data?.filter((s: any) => s.status !== "done").map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.party_name} — {s.sauda_basic}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardTitle>
          </CardHeader>
          
          <CardContent className="p-0 overflow-visible">
            <table className="w-full text-sm border-collapse">
              {/* TABLE HEADERS: Sticks below the Category Header */}
              <thead className="sticky top-[163px] z-20 hidden sm:table-header-group bg-white dark:bg-slate-950 border-b shadow-sm">
                <tr className="text-muted-foreground text-left text-[11px] font-bold uppercase">
                  <th className="p-3">Item</th>
                  <th className="p-3 text-right">Gauge Diff</th>
                  <th className="p-3 text-right text-blue-600">Today's Rate</th>
                  <th className="p-3 text-right text-orange-600">Sauda Rate</th>
                  <th className="p-3 text-right">Party Rate</th>
                  <th className="p-3 text-right">Available Qty</th>
                  <th className="p-3 text-right">Last Purchase</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                    <td className="p-3 font-semibold">{r.name}</td>
                    <td className="p-3 text-right">
                      {isEditingGauges ? (
                        <Input 
                          className="h-7 w-16 ml-auto text-right text-xs font-bold border-primary" 
                          type="number" 
                          value={tempGauges[r.id] ?? r.gauge_diff}
                          onChange={(e) => setTempGauges({ ...tempGauges, [r.id]: e.target.value })} 
                        />
                      ) : (
                        <span className="text-muted-foreground font-mono">{r.gauge_diff > 0 ? `+${r.gauge_diff}` : r.gauge_diff}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600">{r.today.toFixed(0)}</td>
                    <td className="p-3 text-right font-mono font-bold text-orange-600">{r.sauda === null ? "—" : r.sauda.toFixed(0)}</td>
                    <td className="p-3 text-right font-mono">{r.party.toFixed(0)}</td>
                    <td className="p-3 text-right tabular-nums">{Number(r.available_qty).toFixed(2)}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">{r.last_purchase_rate ?? "—"}</td>
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
