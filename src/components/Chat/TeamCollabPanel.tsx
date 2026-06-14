import Collab from "../Pond/Collab";

export type TeamCollabPanelProps = {
  poolSessionId: string;
  visible?: boolean;
  onNavigateToSchoolKoi?: () => void;
};

export default function TeamCollabPanel({
  poolSessionId,
  visible = true,
  onNavigateToSchoolKoi,
}: TeamCollabPanelProps) {
  return (
    <Collab
      embedded
      poolSessionId={poolSessionId}
      visible={visible}
      onNavigateToSchoolKoi={onNavigateToSchoolKoi}
    />
  );
}
