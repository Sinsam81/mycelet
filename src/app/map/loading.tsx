import { PageWrapper } from '@/components/layout/PageWrapper';
import { KartSkjelett } from '@/components/ui/SideSkjelett';

// Vises med en gang et trykk på «Kart» er registrert, mens siden henter
// innlogging og rolle. Se SideSkjelett for hvorfor — og hvorfor det ALDRI skal
// ligge en loading.tsx i roten av src/app eller under species/ og soppforhold/.
export default function Loading() {
  return (
    <PageWrapper>
      <KartSkjelett />
    </PageWrapper>
  );
}
