import { useNavigate } from "react-router-dom";
import MobileCoshh from "./MobileCoshh";

// Where the QR code on a storage cupboard lands: the list of what is kept in that cupboard, with the protective
// equipment and first aid for each. The code holds the place (site and room), so nobody picks it from a list.
export default function CoshhLanding({ placeKey }) {
  const navigate = useNavigate();
  return <MobileCoshh placeKey={placeKey} onClose={() => navigate("/", { replace: true })} />;
}
