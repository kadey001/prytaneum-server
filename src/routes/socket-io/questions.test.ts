import http from 'http';
import { AddressInfo } from 'net';
import faker from 'faker';
import { ObjectID } from 'mongodb';
import { Question } from 'prytaneum-typings';
import { io, Socket } from 'socket.io-client';
import { Server } from 'socket.io';

import events from 'lib/events';
import ioServer, { Events } from './socket-io';

// must import to properly listen
import './questions';

let socket: Socket;
let httpServer: http.Server;
let httpServerAddr: AddressInfo;
let ioServerInstance: Server;
const townhallId = new ObjectID();

beforeAll(() => {
    jest.mock('mongodb');
    httpServer = http.createServer().listen();
    // https://nodejs.org/api/net.html#net_server_address
    // this should never be null --
    // "server.address() returns null before the 'listening' event has been emitted or after calling server.close()."
    // listen() is called above
    httpServerAddr = httpServer.address() as AddressInfo;
    ioServerInstance = ioServer.attach(httpServer);
});

afterAll(() => {
    jest.unmock('mongodb');
    ioServerInstance.close();
    httpServer.close();
});

beforeEach((done) => {
    if (!httpServerAddr)
        throw new Error('Test initialization for socketio failed');
    socket = io(
        `http://[${httpServerAddr.address}]:${httpServerAddr.port}/questions`,
        {
            reconnectionDelay: 0,
            forceNew: true,
            transports: ['websocket'],
            query: `townhallId=${townhallId.toHexString()}`,
        }
    );
    socket.on('connect', () => {
        done();
    });
});

afterEach(() => {
    if (socket.connected) {
        socket.disconnect();
    }
    jest.restoreAllMocks();
});

/**
 * NOTE: This seems a little weird that the tests work
 * i'm using .once and .on after I .emit, but it's working so...
 * just a note that if something weird breaks in the future I might need
 * to put the .once/.on's before the .emit
 */
describe('socket-io /questions', () => {
    const questionId = new ObjectID();
    const question: Question = {
        _id: questionId,
        meta: {
            townhallId,
            createdAt: new Date(),
            createdBy: {
                _id: new ObjectID(),
                name: {
                    first: faker.name.firstName(),
                    last: faker.name.lastName(),
                },
            },
        },
        question: faker.lorem.lines(),
        state: 'ASKED',
        likes: [],
        aiml: {
            labels: [],
        },
    };
    it('should send client new questions', async () => {
        events.emit('create-question', question);
        await new Promise((resolve) => {
            socket.once('question-state', (state: Events['question-state']) => {
                const strId = questionId.toHexString();
                expect(state.payload._id).toStrictEqual(strId);
                expect(state.type).toStrictEqual('create-question');
                resolve();
            });
        });
    });
    it('should send client updated questions', async () => {
        events.emit('update-question', question);
        await new Promise((resolve) => {
            socket.once('question-state', (state: Events['question-state']) => {
                const strId = questionId.toHexString();
                expect(state.payload._id).toStrictEqual(strId);
                expect(state.type).toStrictEqual('update-question');
                resolve();
            });
        });
    });
    it('should send client deleted questions', async () => {
        events.emit('delete-question', question);
        await new Promise((resolve) => {
            socket.once('question-state', (state: Events['question-state']) => {
                const strId = questionId.toHexString();
                expect(state.payload._id).toStrictEqual(strId);
                expect(state.type).toStrictEqual('delete-question');
                resolve();
            });
        });
    });
});