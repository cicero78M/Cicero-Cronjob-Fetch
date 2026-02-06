import * as tiktokPostModel from '../model/tiktokPostModel.js';

export const findByClientId = async (client_id) => {
  return await tiktokPostModel.findByClientId(client_id);
};
