import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// Fetch a list of boards (id, name, workspace)
export async function fetchBoards(limit = 100) {
  const query = `query { boards (limit:${limit}) { id name workspace { id name } } }`;
  const res = await monday.api(query);
  return (res && res.data && res.data.boards) || [];
}

// Fetch board details by id
export async function fetchBoardDetails(boardId) {
  const query = `query { boards (ids: [${boardId}]) { id name workspace { id name } } }`;
  const res = await monday.api(query);
  const list = (res && res.data && res.data.boards) || [];
  return list.length > 0 ? list[0] : null;
}

// Fetch items for a metadata board (includes column_values)
export async function fetchMetadataItems(metadataBoardId, limit = 100) {
  const query = `query { boards (ids: [${metadataBoardId}]) { items(limit:${limit}) { id name column_values { id title text value } } } }`;
  const res = await monday.api(query);
  const items =
    res && res.data && res.data.boards && res.data.boards[0]
      ? res.data.boards[0].items || []
      : [];
  return items;
}

export default {
  fetchBoards,
  fetchBoardDetails,
  fetchMetadataItems,
};
