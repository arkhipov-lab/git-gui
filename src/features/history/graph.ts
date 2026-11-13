export interface GraphColumn {
  lane: number;
  color: number;
  top: boolean;
  bottom: boolean;
}

export interface GraphLink {
  from: number;
  to: number;
  color: number;
}

export interface GraphPoint {
  lane: number;
  color: number;
  columns: GraphColumn[];
  links: GraphLink[];
}

export interface GraphCommit {
  hash: string;
  parents: string[];
}

interface Lane {
  hash: string;
  color: number;
}

export function layoutGraph(commits: GraphCommit[]): GraphPoint[] {
  const lanes: Array<Lane | null> = [];
  let nextColor = 0;
  const rows: GraphPoint[] = [];

  for (const commit of commits) {
    let lane = lanes.findIndex((item) => item?.hash === commit.hash);
    let color: number;
    if (lane === -1) {
      color = nextColor;
      nextColor += 1;
      lane = lanes.findIndex((item) => item === null);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push({ hash: commit.hash, color });
      } else {
        lanes[lane] = { hash: commit.hash, color };
      }
    } else {
      color = lanes[lane]?.color ?? 0;
    }

    const before = lanes.map((item) => (item ? { ...item } : null));
    for (let index = 0; index < lanes.length; index += 1) {
      if (lanes[index]?.hash === commit.hash && index !== lane) lanes[index] = null;
    }

    const links: GraphLink[] = [];
    const parents = commit.parents.filter((parent) => parent.length > 0);
    if (parents.length === 0) {
      lanes[lane] = null;
    } else {
      const first = parents[0] ?? "";
      const existing = lanes.findIndex((item, index) => index !== lane && item?.hash === first);
      if (existing !== -1) {
        links.push({ from: lane, to: existing, color: lanes[existing]?.color ?? color });
        lanes[lane] = null;
      } else {
        lanes[lane] = { hash: first, color };
        links.push({ from: lane, to: lane, color });
      }
      for (const parent of parents.slice(1)) {
        const found = lanes.findIndex((item) => item?.hash === parent);
        if (found !== -1) {
          links.push({ from: lane, to: found, color: lanes[found]?.color ?? color });
        } else {
          const parentColor = nextColor;
          nextColor += 1;
          let slot = lanes.findIndex((item) => item === null);
          if (slot === -1) {
            slot = lanes.length;
            lanes.push({ hash: parent, color: parentColor });
          } else {
            lanes[slot] = { hash: parent, color: parentColor };
          }
          links.push({ from: lane, to: slot, color: parentColor });
        }
      }
    }

    const width = Math.max(before.length, lanes.length, lane + 1);
    const columns: GraphColumn[] = [];
    for (let index = 0; index < width; index += 1) {
      const upper = Boolean(before[index]);
      const lower = Boolean(lanes[index]);
      if (!upper && !lower && index !== lane) continue;
      columns.push({
        lane: index,
        color: before[index]?.color ?? lanes[index]?.color ?? color,
        top: upper,
        bottom: lower,
      });
    }
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    rows.push({ lane, color, columns, links });
  }
  return rows;
}
