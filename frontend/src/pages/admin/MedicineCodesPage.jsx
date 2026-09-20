import CodesPage from './CodesPage';
import { medicineCodesApi } from '../../api';

export default function MedicineCodesPage() {
  return (
    <CodesPage
      title="Medicine Codes"
      subtitle="Register medicine codes before creating medicines"
      api={medicineCodesApi}
      codeLabel="Medicine Code"
      hideDescription
      hideStatus
      hideActive
      requireCrudPassword
      requirePasswordOnCreate={false}
      showNumber
      uppercaseCode
      autoIncrementCode
      seriesAwareIncrement
      addButtonLabel="Add Medicine Code"
    />
  );
}
