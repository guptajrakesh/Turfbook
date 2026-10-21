import { Link } from "react-router-dom";
import { Empty } from "../components/ui";

export default function NotFound() {
  return (
    <div className="pt-10">
      <Empty title="Out of bounds">
        That page went wide of the post.{" "}
        <Link to="/" className="text-lime hover:underline">
          Back to the pitch
        </Link>
      </Empty>
    </div>
  );
}
