import * as _ from 'lodash';
import * as moment from 'moment';
const axios = require("axios");
const mongoose = require('./../config/connection');
const querystring = require("querystring");

const Video = require("./../models/video.model");
const Box = require("./../models/box.model");
const User = require("./../models/user.model");
import { Message } from './../models/message.model';

export class SyncService {
    /**
     * After the client auth themselves, they need to caught up with the others in the box. It means they will ask for the
     * current video playing and must have an answer.
     *
     * This has to only send the link and its timestamp. If non-sockets want to know what's playing in a box, they'll listen to
     * a webhook. This is only for in-box requests.
     *
     * @param {any} request
     * @returns
     * @memberof SyncService
     */
    public async onStart(request) {
        // Get the currently played video for the request box
        const boxDetails = await Box.findOne({ _id: request.token }); // TODO: Send only the playlist maybe?

        const currentVideo = _.filter(boxDetails.playlist, (video) => {
            return video.startTime !== null;
        }); // FIXME: Don't return an array of object, it's just one object.

        const videoDetails = await Video.findOne({ _id: currentVideo[0].video });

        const response = {
            link: videoDetails.link,
            name: videoDetails.name,
            submitted_at: currentVideo[0].submitted_at,
            startTime: currentVideo[0].startTime,
        };

        console.log("constructed response for the client: ", response);

        return response;
    }

    /**
     * When recieving a video from an user, the service searches for it in the video database
     * and adds the video to the playlist of the box.
     *
     * If the video's not found in the database, it is created.
     *
     * Once it's done, it emits a confirmation message to the user.
     *
     * @param {any} payload
     * @returns
     * @memberof SyncService
     */
    public async onVideo(payload) {
        console.log("got video from client.", payload);

        // Obtaining video from database. Creating it if needed
        const video = await this.getVideo(payload);

        // Finding the user who submitted the video
        const user = await User.findOne({ token: payload.author });

        // Adding it to the playlist of the box
        const updatedBox = await this.postToBox(video, payload.token);

        let message: string;
        if (user) {
            message = user.name + ' has added the video "' + video.name + '" to the playlist.';
        } else {
            message = 'The video "' + video.name + '" has been added to the playlist';
        }

        const feedback = new Message({
            contents: message,
            source: 'bot',
        });

        return {
            feedback: feedback,
            updatedBox: updatedBox
        };
    }

    /**
     * Gets the video from the database. If it doesn't exist, it will create the new video and send it back.
     *
     * @param {any} payload
     * @returns
     * @memberof SyncService
     */
    private async getVideo(payload) {
        let video = await Video.findOne({ link: payload.link });

        if (!video) {
            const youtubeDetails = await axios.get('http://youtube.com/get_video_info?video_id=' + payload.link);
            const parsedData = querystring.parse(youtubeDetails.data);

            video = await Video.create({ link: payload.link, name: parsedData.title });
        }

        return video;
    }

    /**
     * Adds the obtained video to the playlist of the box
     *
     * @param {any} video
     * @param {any} token
     * @returns
     * @memberof SyncService
     */
    public async postToBox(video, token) {
        let box = await Box.findOne({ _id: token });

        const submissionTime = moment().format('x');

        const submission = {
            video: video._id,
            startTime: null,
            endTime: null,
            ignored: false,
            submitted_at: submissionTime
        };

        box.playlist.unshift(submission);

        let updatedBox = await Box.findOneAndUpdate(
            { _id: token },
            { $set: { playlist: box.playlist } }
        ).populate('playlist.video');

        // TODO: Call getNextVideo if the video submitted is the only remaining one in the queue

        return updatedBox;
    }

    /**
     * Gets the next video from the playlist to play when the previous one ends. Will
     * update the playlist of the box, and send JSON containing all the info for subscribers
     * in the box
     *
     * @param {*} token The token of the box
     * @returns JSON of the nextVideo and the updatedBox
     * @memberof SyncService
     */
    public async getNextVideo(token) {
        console.log('getting next video to play for the box: ', token, '...');

        const transitionTime = moment().format('x');

        // Get next video for box, and refresh playlist
        const box = await Box.findOne({ _id: token });

        // TODO: Find last index to skip ignored videos
        // FIXME: Cause errors if last video
        const currentVideoIndex = _.findIndex(box.playlist, (video) => {
            return video.startTime !== null && video.endTime === null;
        });

        box.playlist[currentVideoIndex].endTime = transitionTime;
        box.playlist[currentVideoIndex - 1].startTime = transitionTime;

        let updatedBox = await Box.findOneAndUpdate(
            { _id: token },
            { $set: { playlist: box.playlist } }
        ).populate('playlist.video');

        console.log('UPDATED BOX: ', updatedBox);

        const nextVideo = updatedBox.playlist[currentVideoIndex - 1];

        const response = {
            link: nextVideo.video.link,
            name: nextVideo.video.name,
            submitted_at: nextVideo.submitted_at,
            startTime: transitionTime,
        };

        return {
            nextVideo: response,
            updatedBox: updatedBox
        };
    }
}

const syncService = new SyncService();
export default syncService;