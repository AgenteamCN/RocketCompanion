import React from 'react';
import { createScopedSyncedState } from '../stores/crossClientSync';
import { Square, CheckCircle, ExternalLink } from 'lucide-react';

const useState = createScopedSyncedState('page:cards');
import { Card, CardHeader, CardBody, CardFooter, SelectableCard } from '../../ui-core/layout/Card';
import { Badge } from '../../ui-core/primitives/Badge';
import { Button } from '../../ui-core/primitives/Button';
import { CodeBlock } from '../CodeBlock';

export const CardsPage: React.FC<{
  isLight?: boolean;
  onNavigateToPlayCards?: () => void;
}> = ({ isLight = false, onNavigateToPlayCards }) => {
  const [selectedCar, setSelectedCar] = useState('fennec', 'selectedCar');

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Card Card and selector</h1>
          <p className={`text-xs mt-1 ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
            Used for info block wrapping, Card container for metric display and vehicle preset selection. Built-in Selection Ring (ring-2) , Macro Press Scaling (scale-98) . 
          </p>
        </div>

        {onNavigateToPlayCards && (
          <Button
            size="sm"
            variant="primary"
            isLight={isLight}
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={onNavigateToPlayCards}
          >
            open 2B · PlayCard Three-Style Page
          </Button>
        )}
      </div>

      {/* 1. Standard Cards */}
      <div className={`p-6 rounded-2xl border flex flex-col gap-4 ${
        isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
      }`}>
        <span className="font-bold text-sm">1. Standard Structured Card (Card)</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card isLight={isLight}>
            <CardHeader
              title="Physics Engine Status"
              subtitle="RocketSim WebAssembly Kernel"
              badge={<Badge variant="success" size="sm" dot isLight={isLight}>ONLINE</Badge>}
              isLight={isLight}
            />
            <CardBody>
              <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                120Hz sub-tick physics step loop active. Car-to-ball collisions calculated via SIMD-accelerated WASM bytecode.
              </p>
            </CardBody>
            <CardFooter isLight={isLight}>
              <span>Sub-tick Latency: 0.42ms</span>
              <Button size="sm" variant="ghost" isLight={isLight}>Inspect</Button>
            </CardFooter>
          </Card>

          <Card isLight={isLight} interactive>
            <CardHeader
              title="Interactive Card (Clickable)"
              subtitle="Hover & active tactile motion"
              action={<ExternalLink className="h-4 w-4 text-neutral-400" />}
              isLight={isLight}
            />
            <CardBody>
              <p className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                Hover trigger border highlight, Support smooth gesture feedback and focus ring assistance. 
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 2. Selectable Cards */}
      <div className={`p-6 rounded-2xl border flex flex-col gap-4 ${
        isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
      }`}>
        <span className="font-bold text-sm">2. Vehicle and item selection cards (SelectableCard)</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
          <SelectableCard
            id="octane"
            title="Octane Standard"
            subtitle="Standard balanced hitbox"
            selected={selectedCar === 'octane'}
            onSelect={setSelectedCar}
            isLight={isLight}
            badge={<Badge size="sm" isLight={isLight}>Classic</Badge>}
            tags={['All-Round', 'Ranked 1#']}
            preview={<span className="text-3xl">[Car]</span>}
          />

          <SelectableCard
            id="fennec"
            title="Fennec MK-II"
            subtitle="High visual hit accuracy"
            selected={selectedCar === 'fennec'}
            onSelect={setSelectedCar}
            isLight={isLight}
            badge={<Badge size="sm" variant="primary" isLight={isLight}>Pro Choice</Badge>}
            tags={['Boxy Hitbox', 'Meta']}
            preview={<span className="text-3xl">[Car]</span>}
          />
        </div>
        <p className={`text-xs font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Currently Selected Vehicle ID: <span className="text-amber-500 font-bold">{selectedCar}</span>
        </p>
      </div>

      {/* Code Snippet */}
      <CodeBlock
        isLight={isLight}
        title="Agent code recipe (Card Recipe)"
        code={`import { Card, CardHeader, CardBody, CardFooter, SelectableCard } from '@/ui-core/layout/Card';

// 1. Standard Info Card
<Card isLight={isLight}>
  <CardHeader title="Server Metrics" badge={<Badge variant="success">OK</Badge>} />
  <CardBody>Content details here</CardBody>
</Card>

// 2. Selective interaction card (Garage Garage)
<SelectableCard
  id="fennec"
  title="Fennec MK-II"
  subtitle="Boxy Hitbox"
  selected={activeId === 'fennec'}
  onSelect={handleSelect}
  isLight={isLight}
  tags={['Pro Pick']}
/>`}
      />
    </div>
  );
};
