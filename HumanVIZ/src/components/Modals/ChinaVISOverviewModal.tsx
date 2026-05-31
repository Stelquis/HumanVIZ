import { Modal } from "@mantine/core";
import { dashStore } from "../../stores/dashStore";
import DataOverviewContent from "./DataOverviewContent";
import "./ChinaVISOverviewModal.scss";

function ChinaVISOverviewModal() {
  const { overviewModalOpened, setOverviewModalOpened } = dashStore();

  const closeModal = () => setOverviewModalOpened(false);

  return (
    <Modal
      opened={overviewModalOpened}
      onClose={closeModal}
      transitionProps={{
        transition: "pop",
        duration: 280,
        timingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      centered
      size="auto"
      styles={{
        content: { padding: '0 24px 24px', maxWidth: 1160, minWidth: 400 },
        header: { paddingBottom: 16 }
      }}
      id="chinavis-overview-modal"
    >
      <DataOverviewContent showProjectSidebar={true} />
    </Modal>
  );
}

export default ChinaVISOverviewModal;
