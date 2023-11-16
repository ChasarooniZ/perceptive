import {PerceptiveUtils, cModuleName, Translate} from "./utils/PerceptiveUtils.js";
import {WallUtils} from "./utils/WallUtils.js";
import {PerceptiveFlags} from "./helpers/PerceptiveFlags.js";
import {PerceptiveCompUtils, cLibWrapper } from "./compatibility/PerceptiveCompUtils.js";
import {PerceptivePopups} from "./helpers/PerceptivePopups.js";

class PeekingManager {
	//DECLARATIONS
	static async PeekDoorGM(pDoor, pTokens, pInfos) {} //start peeking pWall with all selected tokens
	
	static async RequestPeekDoor(pDoor, pTokens, pInfos) {} //starts a request to peek door
	
	static async PeekDoor(pDoor, pTokens) {} //starts a lock peek for pTokens of pDoor
	
	static async PeekDoorRequest(pDoorID, pSceneID, pDirectionInfo) {} //answers a door peek request
	
	static async updateDoorPeekingWall(pDoor) {} //updates the peeking walls of pDoor
	
	static async stopLockpeeking(pToken) {} //stops pToken from peeking
	
	static IgnoreWall(pWall, pToken) {} //if pWall should be ignored by pToken
	
	//ons
	static async onDeleteWall(pWall) {} //called when a wall is deleted
	
	static onDoorOpen(pDoor) {} //called when a door opened external
	
	static async onDoorClose(pDoor) {} //called when a door closed external
	
	static OnTokenupdate(pToken, pchanges, pInfos) {} //called when a token is updated
	
	//IMPLEMENTATIONS
	static async PeekDoorGM(pDoor, pTokens, pInfos) {
		if (PerceptiveFlags.canbeLockpeeked(pDoor)) {
			if (!WallUtils.isOpened(pDoor)) {	
				await PerceptiveFlags.createLockpeekingWalls(pDoor); //to prevent bugs
				
				let vAdds = pTokens.filter(vToken => !PerceptiveFlags.isLockpeekedby(pDoor, vToken.id) && !PerceptiveFlags.isLockpeeking(vToken));
				
				let vPreviousLength = vAdds.length;
				
				vAdds = vAdds.filter(vToken => WallUtils.isWithinRange(vToken, pDoor, "LockPeek"));
				
				if (vAdds.length < vPreviousLength) {
					PerceptivePopups.TextPopUpID(pDoor, "OutofRange") //MESSAGE POPUP
				}
				
				let vRemoves = pTokens.filter(vToken => !vAdds.includes(vToken) && PerceptiveFlags.isLockpeekedby(pDoor, vToken.id) && PerceptiveFlags.isLockpeeking(vToken));
				
				let vAction = async function(pRemoveAdds = false) {
					if (pRemoveAdds) {
						vAdds = [];
					}
					
					await PerceptiveFlags.addremoveLockpeekedby(pDoor, PerceptiveUtils.IDsfromTokens(vAdds), PerceptiveUtils.IDsfromTokens(vRemoves));
					
					await PeekingManager.updateDoorPeekingWall(pDoor);
					
					for (let i = 0; i < pTokens.length; i++) {
						if (vRemoves.includes(pTokens[i])) {
							await PerceptiveFlags.stopLockpeeking(pTokens[i]);
						}
						
						if (pTokens[i].object) {
							pTokens[i].object.updateVisionSource();
						}
					}
				}
				
				if (!game.settings.get(cModuleName, "GMConfirmPeeking") || (vAdds.length <= 0) || (pInfos?.PlayerID == game.user.id)) {
					vAction();
				}
				else {
					Dialog.confirm({
					  title: Translate("PeekingConfirm.name"),
					  content: Translate("PeekingConfirm.descrp", {pUserName : game.users.get(pInfos?.PlayerID).name}),
					  yes: () => {vAction()},
					  no: () => {vAction(true)},
					  defaultYes: false
					});					
				}
			}
		}
		else {
			PerceptivePopups.TextPopUpID(pDoor, "CantbePeeked") //MESSAGE POPUP
		}
	}
	
	static async RequestPeekDoor(pDoor, pTokens, pInfos = {}) {
		let pInfos = {PlayerID : game.user.id};
		
		if (pDoor) {
			if (game.user.isGM) {
				PeekingManager.PeekDoorGM(pDoor, pTokens, pInfos);
			}
			else {
				if (!game.paused) {
					game.socket.emit("module." + cModuleName, {pFunction : "PeekDoorRequest", pData : {pSceneID : canvas.scene.id, pDoorID : pDoor.id, pTokenIDs : PerceptiveUtils.IDsfromTokens(pTokens), pInfos : pInfos}});
				}
			}	
		}
	}
	
	static async PeekDoor(pDoor, pTokens) {
		let vInfos = {};
		
		let vDirectRequest = true;
		
		let vCharacter = pTokens[0];
		
		if (PerceptiveFlags.hasPeekingDC(pDoor) && game.settings.get(cModuleName, "PeekingFormula").length > 0) {
			if (!game.settings.get(cModuleName, "usePf2eSystem")) {
				
				let vRollData = {actor : vCharacter?.actor};
				
				let vRollFormula = VisionUtils.PeekingFormula();
				
				if (!vRollFormula.length) {
					//if nothing has been set
					vRollFormula = "0";
				}
			
				let vRoll =  new Roll(vRollFormula, vRollData);
					
				PerceptiveSound.PlayDiceSound(pTokens);
					
				await vRoll.evaluate();
					
				await ChatMessage.create({user: game.user.id, flavor : Translate("ChatMessage.Peeking", {pName : vCharacter?.name}),rolls : [vRoll], type : 5}); //CHAT MESSAGE
					
				vInfos = {Rollresult : vRoll.total, Diceresult : vRoll.dice[0].results.map(vDie => vDie.result)};
			}
			else {	
				vDirectRequest = false;
				
				//no roll neccessary, handled by Pf2e system
				let vCallback = async (proll) => {
					let vResult;
					
					switch (proll.outcome) {
						case 'criticalFailure':
							vResult = -1;
							break;
						case 'failure':
							vResult = 0;
							break;
						case 'success':
							vResult = 1;
							break;
						case 'criticalSuccess':
							vResult = 2;
							break;
						default:
							vResult = 0;
							break;
					}
					
					vInfos = {usePf2eRoll : true, Pf2eresult : vResult};
				
					PeekingManager.RequestPeekDoor(pDoor, pTokens, vInfos);
				};
	
				game.pf2e.actions.seek({
					actors: vCharacter.actor,
					callback: vCallback,
					difficultyClass: {value : PerceptiveFlags.PickPocketDC(pDoor)}
				});
			}
		}
		
		if (vDirectRequest) {
			PeekingManager.RequestPeekDoor(pDoor, pTokens, vInfos);
		}
	}
	
	static async PeekDoorRequest(pDoorID, pSceneID, pTokenIDs, pInfos) {
		if (game.user.isGM) {
			PeekingManager.PeekDoorGM(PerceptiveUtils.WallfromID(pDoorID, game.scenes.get(pSceneID)), PerceptiveUtils.TokensfromIDs(pTokenIDs, game.scenes.get(pSceneID)), pInfos)
		}		
	}
	
	static async updateDoorPeekingWall(pDoor) {
		if (PerceptiveFlags.canbeLockpeeked(pDoor)) {
			let vLockPeekingWalls = PerceptiveUtils.WallsfromIDs(PerceptiveFlags.getLockpeekingWallIDs(pDoor), pDoor.parent);
			
			if (!vLockPeekingWalls.length) {
				await PerceptiveFlags.createLockpeekingWalls(pDoor);
				
				vLockPeekingWalls = PerceptiveUtils.WallsfromIDs(PerceptiveFlags.getLockpeekingWallIDs(pDoor), pDoor.parent);
			}
			
			if (vLockPeekingWalls.length) {	
				for (let i = 0; i < vLockPeekingWalls.length; i++) {
					if (WallUtils.isOpened(pDoor)) {
						WallUtils.hidewall(vLockPeekingWalls[i]);
					}
					else {
						await WallUtils.syncWallfromDoor(pDoor, vLockPeekingWalls[i]);
						
						if (i >= 0 && i <= 1) {
							vLockPeekingWalls[i].update({c : WallUtils.calculateSlide(pDoor.c, PerceptiveFlags.DoorMinMax(i+(1-2*i)*PerceptiveFlags.LockPeekingPosition(pDoor)-PerceptiveFlags.LockPeekingSize(pDoor)/2), i).map(vvalue => Math.round(vvalue))});
						}
						
						if (i > 1) {
							WallUtils.makewalltransparent(vLockPeekingWalls[i]);
						}
					}
				}
			}	
		}
		else {
			/*
			let vLockPeekingWalls = PerceptiveUtils.WallsfromIDs(PerceptiveFlags.getmovingWallID(pDoor), pDoor.parent);
			
			if (vLockPeekingWalls) {
				WallUtils.deletewall(vLockPeekingWalls);
			}
			*/
			PerceptiveFlags.deleteLockpeekingWalls(pDoor);
		}
	}
	
	static async stopLockpeeking(pToken) {
		if (PerceptiveFlags.isLockpeeking(pToken)) {
			let vPeekedWall = PerceptiveFlags.getLockpeekedWall(pToken);
			
			if (vPeekedWall) {
				await PerceptiveFlags.removeLockpeekedby(vPeekedWall, pToken.id);
			}
			
			await PerceptiveFlags.stopLockpeeking(pToken);
				
			pToken.object.updateVisionSource();
		}
	}
	
	static IgnoreWall(pWall, pToken) {
		if (!pToken) {
			return PerceptiveFlags.isLockpeekingWall(pWall);
		}
		
		if (WallUtils.isDoor(pWall)) {
			//console.log("Wall Check:",pWall.id, PerceptiveFlags.isLockpeekedby(pWall, pToken.id) && PerceptiveFlags.isLockpeeking(pToken)); 
			return PerceptiveFlags.isLockpeekedby(pWall, pToken.id) && PerceptiveFlags.isLockpeeking(pToken); //is a lock peeked door
		}
		
		if (PerceptiveFlags.isLockpeekingWall(pWall)) {
			//console.log("Wall Check:",pWall.id, !(PerceptiveFlags.isLockpeekedby(pWall, pToken.id) && PerceptiveFlags.isLockpeeking(pToken))); 
			return !(PerceptiveFlags.isLockpeekedby(pWall, pToken.id) && PerceptiveFlags.isLockpeeking(pToken)); //is a wall to limit lockpeeking sight
		}
		
		return false;
	}
	
	//ons
	static async onDeleteWall(pWall) {
		await PerceptiveFlags.deleteLockpeekingWalls(pWall, true);
	}
	
	static onDoorOpen(pDoor) {
		PerceptiveFlags.removeallLockpeekedby(pDoor);
		
		let vLockPeekingWalls = PerceptiveUtils.WallsfromIDs(PerceptiveFlags.getLockpeekingWallIDs(pDoor), pDoor.parent);
		
		for (let i = 0; i < vLockPeekingWalls.length; i++) {
			WallUtils.hidewall(vLockPeekingWalls[i]);
		}
	}
	
	static async onDoorClose(pDoor) {

	}
	
	static OnTokenupdate(pToken, pchanges, pInfos) {
		if (game.user.isGM) {
			if (PerceptiveFlags.isLockpeeking(pToken)) {
				if (pchanges.hasOwnProperty("x") || pchanges.hasOwnProperty("y")) {
					if (game.settings.get(cModuleName, "StopPeekonMove") || !WallUtils.isWithinRange(pToken, PerceptiveFlags.getLockpeekedWall(pToken), "LockPeek")) {
						PeekingManager.stopLockpeeking(pToken);
					}
				}
			}
		}
	}
}

//Hooks
Hooks.once("init", function() {
	if (PerceptiveCompUtils.isactiveModule(cLibWrapper)) {
		libWrapper.register(cModuleName, "ClockwiseSweepPolygon.prototype._testWallInclusion", function(pWrapped, pwall, pbounds) {if (pwall && this?.config?.source?.object && PeekingManager.IgnoreWall(pwall.document, this.config.source.object.document)){return false} return pWrapped(pwall, pbounds)}, "MIXED");
	}
	else {
		const vOldTokenCall = ClockwiseSweepPolygon.prototype._testWallInclusion;
		
		ClockwiseSweepPolygon.prototype._testWallInclusion = function (pwall, pbounds) {
			if (pwall && this?.config?.source?.object && PeekingManager.IgnoreWall(pwall.document, this.config.source.object.document)) {
				return false;
			}
			
			let vTokenCallBuffer = vOldTokenCall.bind(this);
			
			return vTokenCallBuffer(pwall, pbounds);
		}
	}
});

Hooks.on("updateWall", async (pWall, pchanges, pinfos) => {
	if (game.user.isGM) {	
		if (pchanges.hasOwnProperty("ds")) {
			if (WallUtils.isOpened(pWall)) {
				PeekingManager.onDoorOpen(pWall);
			}
			else {
				PeekingManager.onDoorClose(pWall);
			}
		}
		else {
			if (!pinfos.PerceptiveChange) {
				await PeekingManager.updateDoorPeekingWall(pWall);
			}
		}
	}
});

Hooks.on("updateToken", (...args) => PeekingManager.OnTokenupdate(...args));

Hooks.on("deleteWall", (pWall, pchanges, pinfos) => {
	if (game.user.isGM) {
		PeekingManager.onDeleteWall(pWall);
	}
});

Hooks.on(cModuleName + "." + "DoorRClick", (pWall, pKeyInfos) => {
	if (PerceptiveUtils.KeyisDown("MousePeekLock")) {
		PeekingManager.RequestPeekDoor(pWall, PerceptiveUtils.selectedTokens());
		
		return false;
	}
});

//socket exports
export function PeekDoorRequest({pDoorID, pSceneID, pTokenIDs, pInfos} = {}) {return PeekingManager.PeekDoorRequest(pDoorID, pSceneID, pTokenIDs, pInfos)};

//exports
export function RequestPeekDoor(pDoor, pTokens) {PeekingManager.RequestPeekDoor(pDoor, pTokens)} //to request a peek change of tokens for wall

export function SelectedPeekhoveredDoor() {PeekingManager.RequestPeekDoor(PerceptiveUtils.hoveredWall(), PerceptiveUtils.selectedTokens())}

export function PeekingIgnoreWall(pWall, pToken) {return PeekingManager.IgnoreWall(pWall, pToken)}