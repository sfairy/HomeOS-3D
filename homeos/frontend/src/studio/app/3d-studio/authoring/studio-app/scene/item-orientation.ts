import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { clamp as clamp2 } from "../../../plan/geometry";
import { finite as finite2 } from "../../../loaders/studio-normalization";
import { lampItemTypeSet, openStairTypeSet } from "../../items/item-catalog";

export function applyItemOrientation(orientedItemGroup: any, itemDescriptor: any) {
  if (
    ((orientedItemGroup.rotation.y = -ns2.MathUtils.degToRad(finite2(itemDescriptor.rotation, 0))),
    openStairTypeSet.has(itemDescriptor.type) &&
      (orientedItemGroup.scale.x = itemDescriptor.stairDirection === "left" ? -1 : 1),
    itemDescriptor.type === "shoecabinet" &&
      itemDescriptor.shoeCabinetMirrored === true &&
      (orientedItemGroup.scale.x = -1),
    ["camera", "presence"].includes(itemDescriptor.type))
  ) {
    ((orientedItemGroup.rotation.order = "YXZ"),
      (orientedItemGroup.rotation.x = ns2.MathUtils.degToRad(
        clamp2(finite2(itemDescriptor.verticalRotation, 0), -180, 180),
      )));
    return;
  }
  if (lampItemTypeSet.has(itemDescriptor.type)) {
    if (itemDescriptor.type === "striplight")
      ((orientedItemGroup.rotation.order = "YXZ"),
        (orientedItemGroup.rotation.x = 0),
        (orientedItemGroup.rotation.z = 0));
    else {
      const degToRad6 = ns2.MathUtils.degToRad(
        clamp2(finite2(itemDescriptor.verticalRotation, 0), -90, 90),
      );
      ((orientedItemGroup.rotation.order = "YXZ"), (orientedItemGroup.rotation.x = degToRad6));
    }
  }
}
