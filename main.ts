function allDead () {
    for (let r of players) {
        if (r.health != HealthState.Dead) {
            return false
        }
    }
    return true
}
function gameFace () {
    switch (state) {
        case GameState.Stopped:
            basic.showIcon(GameIcons.Pairing)
            break
        case GameState.Pairing:
            if (playerIcon > -1)
                basic.showString(playerIcons[playerIcon])
            else
                basic.showIcon(paired ? GameIcons.Paired : GameIcons.Pairing, 1)
            break
        case GameState.Infecting:
        case GameState.Running:
            switch (health) {
                case HealthState.Dead:
                    basic.showIcon(GameIcons.Dead, 1)
                    break
                case HealthState.Sick:
                    basic.showIcon(GameIcons.Sick, 1)
                    break
                default:
                    basic.showIcon(GameIcons.Healthy, 1)
                    break
            }
            break
        case GameState.Over:
            basic.showString(playerIcons[playerIcon])
            basic.pause(2000)
            switch (health) {
                case HealthState.Dead:
                    basic.showIcon(GameIcons.Dead, 2000)
                    break
                case HealthState.Sick:
                    basic.showIcon(GameIcons.Sick, 2000)
                    break
                case HealthState.Incubating:
                    basic.showIcon(GameIcons.Incubating, 2000)
                    break
                default:
                    basic.showIcon(GameIcons.Healthy, 2000)
                    break
            }
            if (infectedBy > -1) {
                basic.showString(" INFECTED BY")
                basic.showString(playerIcons[infectedBy])
                basic.pause(2000)
            } else {
                basic.showString(" PATIENT ZERO")
                basic.pause(2000)
            }
            game.showScore()
            basic.pause(1000)
            break
    }
}
radio.onReceivedBuffer(function (receivedBuffer) {
    const incomingMessage = new Message(receivedBuffer)
signal = radio.receivedPacket(RadioPacketProperty.SignalStrength)
    if (master) {
        switch (incomingMessage.kind) {
            case MessageKind.PairRequest:
                let n = players.length
                player(incomingMessage.fromSerialNumber)
                if (n != players.length) {
                    basic.showNumber(players.length)
                }
                break
            case MessageKind.HealthValue:
                let s = player(incomingMessage.fromSerialNumber)
                s.health = incomingMessage.value
                if (allDead())
                    gameOver()
                break
        }
    } else {
        switch (incomingMessage.kind) {
            case MessageKind.GameState:
                state = incomingMessage.value as GameState
                break
            case MessageKind.InitialInfect:
                if (infectedBy < 0 &&
                    incomingMessage.toSerialNumber == control.deviceSerialNumber()) {
                    infectedBy = 0
                    infectedTime = input.runningTime()
                    health = HealthState.Incubating
                    serial.writeLine(`infected ${control.deviceSerialNumber()}`)
                }
                break
            case MessageKind.HealthSet:
                if (incomingMessage.toSerialNumber == control.deviceSerialNumber()) {
                    const newHealth = incomingMessage.value
                    if (health < newHealth) {
                        health = newHealth
                    }
                }
                break
            case MessageKind.PairConfirmation:
                if (!paired && state == GameState.Pairing &&
                    incomingMessage.toSerialNumber == control.deviceSerialNumber()) {
                    serial.writeLine(`player paired ==> ${control.deviceSerialNumber()}`)
                    playerIcon = incomingMessage.value
                    paired = true
                }
                break
            case MessageKind.TransmitVirus:
                if (state == GameState.Running) {
                    if (health == HealthState.Healthy) {
                        serial.writeLine(`signal: ${signal}`)
                        if (signal > RSSI &&
                            randint(0, 100) > TRANSMISSIONPROB) {
                            infectedBy = incomingMessage.value
                            infectedTime = input.runningTime()
                            health = HealthState.Incubating
                        }
                    }
                }
                break
            case MessageKind.HealthValue:
                if (health != HealthState.Dead && signal > RSSI) {
                    game.addScore(1)
                }
                break
        }
    }
})
function gameOver () {
    state = GameState.Over
if (patientZero) {
        patientZero.show()
    }
}
input.onButtonPressed(Button.AB, function () {
    if (state == GameState.Stopped && !(master)) {
        master = true
        paired = true
        state = GameState.Pairing
serial.writeLine("registered as master")
        radio.setTransmitPower(7)
        basic.showString("0")
        return
    }
    if (!(master)) {
        return
    }
    if (state == GameState.Pairing) {
        patientZero = players[randint(0, players.length - 1)]
        state = GameState.Infecting
serial.writeLine("" + (`game started ${players.length} players`))
    } else if (state == GameState.Running) {
        gameOver()
    }
})
function player (id: number) {
    for (let p of players) {
        if (p.id == id) {
            return p
        }
    }
    let q = new Player()
q.id = id
q.icon = (players.length + 1) % playerIcons.length
q.health = HealthState.Healthy
players.push(q)
    serial.writeLine("" + (`player ==> ${q.id}`))
    return q
}
let master = false
let signal = 0
let infectedTime = 0
let paired = false
let players: Player[] = []
let INCUBATION = 20000
let DEATH = 40000
let RSSI = -45
let TRANSMISSIONPROB = 40
enum GameState {
    Stopped,
    Pairing,
    Infecting,
    Running,
    Over
}
enum HealthState {
    Healthy,
    Incubating,
    Sick,
    Dead
}
enum MessageKind {
    PairRequest,
    PairConfirmation,
    HealthSet,
    HealthValue,
    InitialInfect,
    TransmitVirus,
    GameState
}
const GameIcons = {
    Pairing: IconNames.Ghost,
    Paired: IconNames.Happy,
    Dead: IconNames.Skull,
    Sick: IconNames.Sad,
    Incubating: IconNames.Confused,
    Healthy: IconNames.Happy
}
class Message {

    private _data: Buffer

    constructor(input?: Buffer) {
        this._data = input || control.createBuffer(13)
    }

    get kind(): number {
        return this._data.getNumber(NumberFormat.Int8LE, 0)
    }

    set kind(x: number) {
        this._data.setNumber(NumberFormat.Int8LE, 0, x)
    }

    get fromSerialNumber(): number {
        return this._data.getNumber(NumberFormat.Int32LE, 1)
    }

    set fromSerialNumber(x: number) {
        this._data.setNumber(NumberFormat.Int32LE, 1, x)
    }

    get value(): number {
        return this._data.getNumber(NumberFormat.Int32LE, 5)
    }

    set value(x: number) {
        this._data.setNumber(NumberFormat.Int32LE, 5, x)
    }

    get toSerialNumber(): number {
        return this._data.getNumber(NumberFormat.Int32LE, 9)
    }

    set toSerialNumber(x: number) {
        this._data.setNumber(NumberFormat.Int32LE, 9, x)
    }

    send() {
        radio.sendBuffer(this._data)
        basic.pause(250)
    }
}
let playerIcons = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
class Player {
    id: number
    icon: number
    health: HealthState
    show() {
        basic.showString(playerIcons[this.icon])
    }
}
let state = GameState.Stopped
let patientZero: Player
let infectedBy = -1
let playerIcon = -1
let health = HealthState.Healthy
radio.setGroup(42)
basic.showIcon(GameIcons.Pairing)
basic.forever(function () {
    let message: Message
if (master) {
        switch (state) {
            case GameState.Pairing:
                for (const t of players) {
                    message = new Message()
                    message.kind = MessageKind.PairConfirmation
                    message.value = t.icon
                    message.toSerialNumber = t.id
                    message.send()
                }
                serial.writeLine(`pairing ${players.length} players`)
                basic.pause(500)
                break
            case GameState.Infecting:
                if (patientZero.health == HealthState.Healthy) {
                    message = new Message()
                    message.kind = MessageKind.InitialInfect
                    message.toSerialNumber = patientZero.id
                    message.send()
                    basic.pause(100)
                } else {
                    serial.writeLine(`patient ${patientZero.id} infected`)
                    basic.showIcon(GameIcons.Dead)
                    state = GameState.Running
                }
                break
            case GameState.Running:
                for (const u of players) {
                    message = new Message()
                    message.kind = MessageKind.HealthSet
                    message.value = u.health
                    message.toSerialNumber = u.id
                    message.send()
                }
                break
            case GameState.Over:
                if (patientZero)
                    patientZero.show()
                break
        }
message = new Message()
message.kind = MessageKind.GameState
message.value = state
message.send()
    } else {
        switch (state) {
            case GameState.Pairing:
                if (playerIcon < 0) {
                    message = new Message()
                    message.kind = MessageKind.PairRequest
                    message.fromSerialNumber = control.deviceSerialNumber()
                    message.send()
                } else if (infectedBy > -1) {
                    message = new Message()
                    message.kind = MessageKind.HealthValue
                    message.fromSerialNumber = control.deviceSerialNumber()
                    message.value = health
                    message.send()
                }
                break
            case GameState.Infecting:
                message = new Message()
                message.kind = MessageKind.HealthValue
                message.fromSerialNumber = control.deviceSerialNumber()
                message.value = health
                message.send()
                break
            case GameState.Running:
                if (health != HealthState.Healthy && input.runningTime() - infectedTime > DEATH)
                    health = HealthState.Dead
                else if (health != HealthState.Healthy && input.runningTime() - infectedTime > INCUBATION)
                    health = HealthState.Sick
                if (health == HealthState.Incubating || health == HealthState.Sick) {
                    message = new Message()
                    message.kind = MessageKind.TransmitVirus
                    message.fromSerialNumber = control.deviceSerialNumber()
                    message.value = playerIcon
                    message.send()
                }
                message = new Message()
                message.kind = MessageKind.HealthValue
                message.fromSerialNumber = control.deviceSerialNumber()
                message.value = health
                message.send()
                break
        }
gameFace()
    }
})
