import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRODUCT_CATALOG } from "@/lib/product-constants";
import type { ArmKey } from "@/lib/product-constants";

const ALL_ARMS = Object.keys(PRODUCT_CATALOG) as ArmKey[];

interface ProductCatalogProps {
  enabledArms: string[] | true;
  onSelect: (arm: string) => void;
}

export function ProductCatalog({ enabledArms, onSelect }: ProductCatalogProps) {
  const visibleArms =
    enabledArms === true
      ? ALL_ARMS
      : ALL_ARMS.filter((a) => (enabledArms as string[]).includes(a));

  const hiddenCount = ALL_ARMS.length - visibleArms.length;

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-lg font-semibold">Produtos disponíveis</h2>
        {hiddenCount > 0 && (
          <span className="text-xs text-amber-400">
            {hiddenCount} produto{hiddenCount > 1 ? "s" : ""} ocultado{hiddenCount > 1 ? "s" : ""} pela flag{" "}
            <code className="font-mono">bandit_arms_enabled</code>
          </span>
        )}
      </div>

      {visibleArms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum produto disponível — <code className="font-mono">bandit_arms_enabled</code> está vazio
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleArms.map((arm) => {
            const p = PRODUCT_CATALOG[arm];
            return (
              <Card
                key={arm}
                className="relative bg-card border-border hover:border-indigo-600/60 transition-colors cursor-pointer group"
              >
                {p.badge && (
                  <Badge className="absolute right-3 top-3 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs">
                    {p.badge}
                  </Badge>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-base pr-16">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-2xl font-bold text-indigo-400">{p.rate}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.term}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full group-hover:border-indigo-600/60"
                    onClick={() => onSelect(arm)}
                  >
                    Simular
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
