/**
 * 运行时楼层选择（0.8.1 `floor-navigation`）。
 *
 * 「全屋」(`"all"`) 只有在**多于一层的户型**里才是合法楼层：单层户型选 all 会切到
 * overview / 全屋态，而实际根本没有第二层可看，用户就停在了一个空的总览视角上。
 * 上游在这里显式加了 `floors.length > 1` 的守卫，本项目此前无条件接受 `"all"`。
 */
export type RuntimeFloorEntry = { id: string };

export function resolveRuntimeFloor(
  floors: readonly RuntimeFloorEntry[] | null | undefined,
  floorSelection: string | null | undefined,
): string | undefined {
  const list = floors || [];
  if (floorSelection === "all" && list.length > 1) return "all";
  if (floorSelection && list.some((floor) => floor.id === floorSelection)) return floorSelection;
  return list[0]?.id;
}
