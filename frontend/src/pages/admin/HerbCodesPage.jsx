import CodesPage from './CodesPage';
import { herbCodesApi } from '../../api';

export default function HerbCodesPage() {
  return (
    <CodesPage
      title="Herb Codes"
      subtitle="Register herb codes before creating bills"
      api={herbCodesApi}
      codeLabel="Herb Code"
      hideDescription
      hideStatus
      hideActive
      requireCrudPassword
      requirePasswordOnCreate={false}
      showNumber
      uppercaseCode
      autoIncrementCode
      seriesAwareIncrement
      addButtonLabel="Add Herb Code"
    />
  );
}
