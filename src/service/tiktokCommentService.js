import * as tiktokCommentModel from '../model/tiktokCommentModel.js';

export const findByVideoId = async (video_id) => {
  return await tiktokCommentModel.findByVideoId(video_id);
};

