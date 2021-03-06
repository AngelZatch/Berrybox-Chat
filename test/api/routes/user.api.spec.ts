/* eslint-disable no-unused-expressions */
import * as chai from "chai"
import * as express from "express"
import * as supertest from "supertest"
const expect = chai.expect

import { UserApi } from './../../../src/api/routes/user.api'
import { Session } from "./../../../src/models/session.model"
import { UserPlaylistClass, UserPlaylist } from './../../../src/models/user-playlist.model'
import authService from "../../../src/api/services/auth.service"
import { Video } from "../../../src/models/video.model"
import { User, UserDocument } from "../../../src/models/user.model"

describe("User API", () => {
    const expressApp = express()

    let ashJWT: Session = null
    let foreignJWT: Session = null

    before(async () => {
        expressApp.use(express.json())
        expressApp.use('/', UserApi)

        await User.deleteMany({})

        await UserPlaylist.deleteMany({})

        await Video.deleteMany({})

        await Video.create([{
            _id: '9bc72f3d7edc6312d0ef2e47',
            name: 'First Video',
            link: '4c6e3f_aZ0d',
            duration: ''
        }, {
            _id: '9bc72f3d7edc6312d0ef2e48',
            name: 'Second Video',
            link: 'aC9d3edD3e2',
            duration:''
        }])

        const ashUser = await User.create({
            _id: '9ca0df5f86abeb66da97ba5d',
            name: 'Ash Ketchum',
            mail: 'ash@pokemon.com',
            password: 'Pikachu',
            settings: {
                theme: 'light',
                picture: '9ca0df5f86abeb66da97ba5d-picture',
                color: '#CD3E1D',
                isColorblind: false,
                badge: null
            },
            acl: {
                moderator: ['addVideo', 'removeVideo', 'setVIP', 'unsetVIP', 'forceNext', 'forcePlay'],
                vip: ['addVideo', 'removeVideo', 'forceNext'],
                simple: ['addVideo']
            }
        })

        await UserPlaylist.create({
            _id: "8da1e01fda34eb8c1b9db46c",
            name: "Favorites",
            isPrivate: false,
            user: "9ca0df5f86abeb66da97ba5d",
            videos: [],
            isDeletable: false
        })

        const shironaUser = await User.create({
            _id: '9ca0df5f86abeb66da97ba5e',
            name: 'Shirona',
            mail: 'shirona@sinnoh-league.com',
            password: 'Piano',
            settings: {
                theme: 'dark',
                picture: 'default-picture',
                color: '#07D302',
                isColorblind: false,
                badge: null
            },
            acl: {
                moderator: ['addVideo', 'removeVideo', 'setVIP', 'unsetVIP', 'forceNext', 'forcePlay'],
                vip: ['addVideo', 'removeVideo', 'forceNext'],
                simple: ['addVideo']
            }
        })

        await UserPlaylist.create({
            _id: "8da1e01fda34eb8c1b9db46d",
            name: "Favorites",
            isPrivate: false,
            user: "9ca0df5f86abeb66da97ba5e",
            videos: ['9bc72f3d7edc6312d0ef2e48'],
            isDeletable: false
        })

        ashJWT = authService.createSession(ashUser)
        foreignJWT = authService.createSession(shironaUser)

        await UserPlaylist.create({
            _id: "8da1e01fda34eb8c1b9db46e",
            name: "My First Playlist",
            isPrivate: true,
            user: "9ca0df5f86abeb66da97ba5d",
            videos: [],
            isDeletable: true
        })

        await UserPlaylist.create({
            _id: "8da1e01fda34eb8c1b9db46f",
            name: "WiP Playlist 2",
            isPrivate: false,
            user: "9ca0df5f86abeb66da97ba5d",
            videos: [],
            isDeletable: true
        })
    })

    after(async () => {
        await User.deleteMany({})

        await UserPlaylist.deleteMany({})
    })

    describe("Gets the active user details", () => {
        it("Sends a 401 back if the API is accessed from an unauthentified source", () => supertest(expressApp)
            .get('/me')
            .expect(401))

        it("Sends a 200 with the user", () => supertest(expressApp)
            .get('/me')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .expect(200)
            .then(response => {
                const user: UserDocument = response.body

                expect(user.name).to.equal('Ash Ketchum')
                expect(user.password).to.be.undefined
                expect(user.resetToken).to.be.undefined
            }))
    })

    describe("Update their settings", () => {
        it("Sends a 401 back if the API is the token is invalid or not provided", () => supertest(expressApp)
            .patch('/settings')
            .expect(401))

        it("Sends a 412 if no settings are given", () => supertest(expressApp)
            .patch('/settings')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .expect(412))

        it("Sends a 200 if all goes well", () => supertest(expressApp)
            .patch('/settings')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .send({ theme: 'dark' })
            .expect(200)
            .then(async () => {
                const user = await User.findById('9ca0df5f86abeb66da97ba5d')

                expect(user.settings.theme).to.equal("dark")
                expect(user.settings.picture).to.equal("9ca0df5f86abeb66da97ba5d-picture")
            }))
    })

    describe("Update ACL Config", () => {
        it("Sends a 401 back if the API is the token is invalid or not provided", () => supertest(expressApp)
            .patch('/acl')
            .expect(401))

        it("Sends a 412 if no config are given", () => supertest(expressApp)
            .patch('/acl')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .expect(412))

        it("Sends a 200 with the updated ACL", () => supertest(expressApp)
            .patch('/acl')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .send({
                moderator: ['addVideo', 'removeVideo', 'forceNext'],
                vip: ['addVideo', 'removeVideo', 'forceNext'],
                simple: []
            })
            .expect(200)
            .then(response => {
                const aclConfig: UserDocument['acl'] = response.body

                expect(aclConfig).to.deep.equal({
                    moderator: ['addVideo', 'removeVideo', 'forceNext'],
                    vip: ['addVideo', 'removeVideo', 'forceNext'],
                    simple: []
                })
            }))
    })

    describe("Gets the boxes of an user", () => {
        it("Sends a 401 back if the API is accessed from an unauthentified source", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba5d/boxes')
            .expect(401))

        it("Sends a 404 back if no user matches the given id", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba4e/boxes')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .expect(404, 'USER_NOT_FOUND'))

        it("Sends a 200 with the boxes if the id matches", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba5d/boxes')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .expect(200))
    })

    describe("Gets the playlists of an user", () => {
        it("Sends a 401 back if the API is accessed from an unauthentified source", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba5d/playlists')
            .expect(401, 'UNAUTHORIZED'))

        it("Sends a 404 back if no user matches the given id", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba4e/playlists')
            .set('Authorization', `Bearer ${foreignJWT.bearer}`)
            .expect(404, 'USER_NOT_FOUND'))

        it("Sends a 200 with only public playlists if the user requesting is not the author of the playlists", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba5d/playlists')
            .set('Authorization', `Bearer ${foreignJWT.bearer}`)
            .expect(200)
            .then(response => {
                const playlists: UserPlaylistClass[] = response.body

                expect(playlists).to.have.lengthOf(2)
            }))

        it("Sends a 200 with all playlists if the user requesting is the author of the playlists", () => supertest(expressApp)
            .get('/9ca0df5f86abeb66da97ba5d/playlists')
            .set('Authorization', `Bearer ${ashJWT.bearer}`)
            .expect(200)
            .then(response => {
                const playlists: UserPlaylistClass[] = response.body

                expect(playlists).to.have.lengthOf(3)
            }))
    })
})
