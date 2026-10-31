import { Composition, registerRoot } from "remotion";
import { Recap } from "./Recap";
import { FORMAT } from "../domain/edit";
import collection from "../fixtures/collection.json";
import draft from "../fixtures/mixed-media.json";
import { validateEdit } from "../domain/edit";

const defaults = validateEdit(collection, draft);
function Root() {
  return <Composition id="VoyrooRecap" component={Recap} {...FORMAT} defaultProps={defaults} />;
}
registerRoot(Root);
