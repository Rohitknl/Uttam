import CodesPage from './CodesPage';
import { herbCodesApi } from '../../api';

export default function HerbCodesPage() {
  return (
    <CodesPage
      title="Element Codes"
      subtitle="Register element codes before creating bills"
      api={herbCodesApi}
      codeLabel="Element Code"
      hideDescription
      hideStatus
      hideActive
      requireCrudPassword
      requirePasswordOnCreate={false}
      showNumber
      uppercaseCode
      autoIncrementCode
      seriesAwareIncrement
      addButtonLabel="Add Element Code"
    />
  );
}
