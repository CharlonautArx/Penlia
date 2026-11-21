import { Screen } from '../../components/ui';
import { LifeHub } from '../../features/life/Hub';
import { back } from '../../features/social/ui';

export default function Life() {
  return <Screen title="一起生活" back={back}><LifeHub /></Screen>;
}
