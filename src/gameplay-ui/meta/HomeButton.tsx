import { campaignStore } from '../campaign-state';
import { Button } from '../kit';
import { EN } from '../strings-en';

/** Task 45: the «← Home» button at the start of every non-hub page header (the top nav is gone). */
export function HomeButton() {
  return (
    <Button variant="ghost" className="meta-home" onClick={() => campaignStore.setPage('hub')}>
      {EN.meta.nav.home}
    </Button>
  );
}
