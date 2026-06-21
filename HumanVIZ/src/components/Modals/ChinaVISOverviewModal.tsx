import { dashStore } from "../../stores/dashStore";
import DataOverviewContent from "./DataOverviewContent";
import "./ChinaVISOverviewModal.scss";

function ChinaVISOverviewModal() {
  const { overviewModalOpened, setOverviewModalOpened } = dashStore();
  const closeModal = () => setOverviewModalOpened(false);

  if (!overviewModalOpened) return null;

  return (
    <div className="about-overlay" onClick={closeModal}>
      <div className="about-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="about-modal-close" onClick={closeModal} aria-label="关闭">
          ✕
        </button>
        <div className="about-modal-body">
          <DataOverviewContent showProjectSidebar={true} />
        </div>
      </div>
    </div>
  );
}

export default ChinaVISOverviewModal;
