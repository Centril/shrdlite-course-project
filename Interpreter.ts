///<reference path="World.ts"/>
///<reference path="Parser.ts"/>

/**
* Interpreter module
*
* The goal of the Interpreter module is to interpret a sentence
* written by the user in the context of the current world state. In
* particular, it must figure out which objects in the world,
* i.e. which elements in the `objects` field of WorldState, correspond
* to the ones referred to in the sentence.
*
* Moreover, it has to derive what the intended goal state is and
* return it as a logical formula described in terms of literals, where
* each literal represents a relation among objects that should
* hold. For example, assuming a world state where "a" is a ball and
* "b" is a table, the command "put the ball on the table" can be
* interpreted as the literal ontop(a,b). More complex goals can be
* written using conjunctions and disjunctions of these literals.
*
* In general, the module can take a list of possible parses and return
* a list of possible interpretations, but the code to handle this has
* already been written for you. The only part you need to implement is
* the core interpretation function, namely `interpretCommand`, which produces a
* single interpretation for a single command.
*/
module Interpreter {

    //////////////////////////////////////////////////////////////////////
    // exported functions, classes and interfaces/types

/**
Top-level function for the Interpreter. It calls `interpretCommand` for each possible parse of the command. No need to change this one.
* @param parses List of parses produced by the Parser.
* @param currentState The current state of the world.
* @returns Augments ParseResult with a list of interpretations. Each interpretation is represented by a list of Literals.
*/
    export function interpret(parses : Parser.ParseResult[], currentState : WorldState) : InterpretationResult[] {
        var errors : Error[] = [];
        var interpretations : InterpretationResult[] = [];
        parses.forEach((parseresult) => {
            try {
                var result : InterpretationResult = <InterpretationResult>parseresult;
                result.interpretation = interpretCommand(result.parse, currentState);
                interpretations.push(result);
            } catch(err) {
                errors.push(err);
            }
        });
        if (interpretations.length) {
            return interpretations;
        } else {
            // only throw the first error found
            throw errors[0];
        }
    }

    export interface InterpretationResult extends Parser.ParseResult {
        interpretation : DNFFormula;
    }

    export type DNFFormula = Conjunction[];
    type Conjunction = Literal[];

    /**
    * A Literal represents a relation that is intended to
    * hold among some objects.
    */
    export interface Literal {
	/** Whether this literal asserts the relation should hold
	 * (true polarity) or not (false polarity). For example, we
	 * can specify that "a" should *not* be on top of "b" by the
	 * literal {polarity: false, relation: "ontop", args:
	 * ["a","b"]}.
	 */
        polarity : boolean;
	/** The name of the relation in question. */
        relation : string;
	/** The arguments to the relation. Usually these will be either objects
     * or special strings such as "floor" or "floor-N" (where N is a column) */
        args : string[];
    }

    export function stringify(result : InterpretationResult) : string {
        return result.interpretation.map((literals) => {
            return literals.map((lit) => stringifyLiteral(lit)).join(" & ");
            // return literals.map(stringifyLiteral).join(" & ");
        }).join(" | ");
    }

    export function stringifyLiteral(lit : Literal) : string {
        return (lit.polarity ? "" : "-") + lit.relation + "(" + lit.args.join(",") + ")";
    }

    //////////////////////////////////////////////////////////////////////
    // private functions
    /**
     * The core interpretation function. The code here is just a
     * template; you should rewrite this function entirely. In this
     * template, the code produces a dummy interpretation which is not
     * connected to `cmd`, but your version of the function should
     * analyse cmd in order to figure out what interpretation to
     * return.
     * @param cmd The actual command. Note that it is *not* a string, but rather an object of type `Command` (as it has been parsed by the parser).
     * @param state The current state of the world. Useful to look up objects in the world.
     * @returns A list of list of Literal, representing a formula in disjunctive normal form (disjunction of conjunctions). See the dummy interpetation returned in the code for an example, which means ontop(a,floor) AND holding(b).
     */
    function interpretCommand(cmd : Parser.Command, state : WorldState) : DNFFormula {
        // ---------------------------------
        // Does the request object exist?
        // ---------------------------------
        if (cmd.entity) {
          var requestedObjectRelations = getRequestedObjectRelations(cmd.entity.object, state);
          var objectRelationsThatExistsInWorld = getObjectRelationsThatExistsInWorld(requestedObjectRelations, state);

          if (objectRelationsThatExistsInWorld.length == 0) {
            throw "No possible objects found";
          }
        } else {
          var objectRelationsThatExistsInWorld: ObjectRelations[] = [];
          objectRelationsThatExistsInWorld.push(new ObjectRelations("itself", null, null));
        }

        // ---------------------------------
        // Move the object to the desired location
        // ---------------------------------
        var my_interpretation : DNFFormula = [];
        for (var objectRelation of objectRelationsThatExistsInWorld) {
          var results: Conjunction = getPossibleMoves(cmd.command, objectRelation.targetObject, cmd.location, state);
          for (var result of results) {
              my_interpretation.push([result]);
          }
        }
        if (my_interpretation.length == 0) {
          throw "No possible objects to move";
        }
        return my_interpretation;
    }


    function getPossibleMoves(command: string, objectToMove: string, location: Parser.Location, state: WorldState) : Conjunction {
      var result : Conjunction = [];
      if (objectToMove != "floor") {
        if (command == "take" || command == "grasp" || command == "pick up") {
          result.push({polarity: true, relation: "holding", args: [objectToMove]});
        } else if (command == "move" || command == "put" || command == "drop") {
          // We are not interested in the location of the object where objectToMove
          // is going to be placed
          if (location.entity.object.location == null) {
            var locationObjectKeys = getObjectKeys(location.entity.object, state);
            for (var locationObjectKey of locationObjectKeys) {
              if (isMoveValid(objectToMove, location.relation, locationObjectKey, state)) {
                if (objectToMove == "itself") {
                  if (state.holding != null) {
                      result.push({polarity: true, relation: location.relation, args: [state.holding, locationObjectKey]});
                  }
                } else {
                  result.push({polarity: true, relation: location.relation, args: [objectToMove, locationObjectKey]});
                }
              }
            }
          } else {
            // We are interested in the location of the object where objectToMove
            // is going to be placed
            // -----------------------------------------
            // Find the location object that are in the right place.
            // -----------------------------------------
            var requestedRelations: ObjectRelations[] = [];

            var targetObjects = getObjectKeys(location.entity.object.object, state);
            var locationObjects = getObjectKeys(location.entity.object.location.entity.object, state);

            for(var targetObject of targetObjects) {
              for(var locationObject of locationObjects) {
                requestedRelations.push(new ObjectRelations(targetObject, location.entity.object.location.relation, locationObject));
              }
            }
            // Validate locations
            var objectRelationsThatExistsInWorld = getObjectRelationsThatExistsInWorld(requestedRelations, state);

            // -----------------------------------------
            // Return the objectToMove to which location.
            // -----------------------------------------
            for(var objectRelation of objectRelationsThatExistsInWorld) {
                if (isMoveValid(objectToMove, location.relation, objectRelation.targetObject, state)) {
                  if (objectToMove == "itself") {
                    if (state.holding != null) {
                        result.push({polarity: true, relation: location.relation, args: [state.holding, objectRelation.targetObject]});
                    }
                  } else {
                    result.push({polarity: true, relation: location.relation, args: [objectToMove, objectRelation.targetObject]});
                  }

                }
            }
          }
        }
      }
      return result;
    }

    export function isMoveValid(objectToMove: string, relation: string, targetObject: string, state: WorldState) {
      // Nothing can be inside a box if they are large and the box is small
      if (relation == "inside" &&
        (getObjectSize(objectToMove, state) == "large" && getObjectSize(targetObject, state) == "small")
          && getObjectForm(targetObject, state) == "box") {
        return false;

        // Box, plank and pyrmaids cannot be inside or on top of a box if they are large or the box is small
      } else if (
          (relation == "inside" || relation == "ontop") &&
          (
            getObjectForm(objectToMove, state) == "box" ||
            getObjectForm(objectToMove, state) == "plank" ||
            getObjectForm(objectToMove, state) == "pyramid"
          )
          && getObjectForm(targetObject, state) == "box") {
        if (getObjectSize(objectToMove, state) == "large" || getObjectSize(targetObject, state) == "small") {
          return false;
        }

        // Boxes cannot be inside or on top of a brick or pyramid
      } else if (
          (relation == "inside" || relation == "ontop") &&
          getObjectForm(objectToMove, state) == "box" && (
            getObjectForm(targetObject, state) == "brick" ||
            getObjectForm(targetObject, state) == "pyramid"
          )) {
        return false;

        // Balls can only be on top of floors
      } else if (relation == "ontop" && getObjectForm(objectToMove, state) == "ball"
        && (
          getObjectForm(targetObject, state) != "floor"
        )) {
        return false;

        // We cannot move stuff when the targetObject is the same as the one to move
      } else if (targetObject == objectToMove) {
        return false;
      }
      return true;
    }

    // Check whether the specified relation exists in the world
    // @return: - a list of ObjectRelations that exists in the world.
    function getObjectRelationsThatExistsInWorld(objectRelations: ObjectRelations[], state: WorldState) {
      var resultingObjectRelations: ObjectRelations[] = [];
      var foundObjectRelation: Boolean = false;
      for(var objectRelation of objectRelations) {
        if (objectRelation.relation == "beside") {
          foundObjectRelation = isBeside(state.stacks, objectRelation.targetObject, objectRelation.locationObject);
        } else if (objectRelation.relation == "leftof") {
          foundObjectRelation = isLeftOf(state.stacks, objectRelation.targetObject, objectRelation.locationObject);
        } else if (objectRelation.relation == "rightof") {
          foundObjectRelation = isRightOf(state.stacks, objectRelation.targetObject, objectRelation.locationObject);
        } else if (objectRelation.relation == "") {
          foundObjectRelation = doesObjectExist(state.holding, state.stacks, objectRelation.targetObject);
        } else {
          for (var stack of state.stacks) {
            if (objectRelation.relation == "inside") {
              foundObjectRelation = isInside(stack, objectRelation.targetObject, objectRelation.locationObject, state);
            } else if (objectRelation.relation == "ontop") {
              foundObjectRelation = isOnTop(stack, objectRelation.targetObject, objectRelation.locationObject, state);
            } else if (objectRelation.relation == "above") {
              foundObjectRelation = isAbove(stack, objectRelation.targetObject, objectRelation.locationObject, state);
            } else if (objectRelation.relation == "under") {
              foundObjectRelation = isUnder(stack, objectRelation.targetObject, objectRelation.locationObject, state);
            } else {
              console.log("WARNING: not implemented to check world for " +objectRelation.relation);
            }
            if (foundObjectRelation) {
                break;
            }
          }
        }
        if (foundObjectRelation) {
          resultingObjectRelations.push(objectRelation);
        }
        foundObjectRelation = false;
      }
      return resultingObjectRelations;
    }

    // Look at an object and determine how the location should look like
    // @return - requeried order for stack for example 'e','f' || 'e'
    function getRequestedObjectRelations(object: Parser.Object, state: WorldState): ObjectRelations[] {
      var relations: ObjectRelations[] = [];
      if (object.location != null) { //
        // target object
        var targetObjects = getObjectKeys(object.object, state);
        var locationObjects = getObjectKeys(object.location.entity.object, state);
        for(var targetObject of targetObjects) {
          for(var locationObject of locationObjects) {
            relations.push(new ObjectRelations(targetObject, object.location.relation, locationObject));
          }
        }
      } else {
        var targetObjects = getObjectKeys(object, state);
        for(var targetObject of targetObjects) {
          relations.push(new ObjectRelations(targetObject, "", null));
        }
      }
      return relations;
    }

    function getObjectSize(objectKey: string, state: WorldState): string {
      for(let key in state.objects) {
        if (key == objectKey) {
          return state.objects[key].size;
        }
      }
      return null;
    }

    function getObjectForm(objectKey: string, state: WorldState): string {
      if (objectKey == "floor") {
        return "floor";
      }
      for(let key in state.objects) {
        if (key == objectKey) {
          return state.objects[key].form;
        }
      }
      return null;
    }
    // Return all the objects in the world state that matches the criteria.
    function getObjectKeys(object: Parser.Object, state: WorldState): string[] {
      var keys: string[] = [];
      if (object.form == "floor") {
        keys.push("floor");
      } else {
        for(let key in state.objects) {
          if (
            (object.form == state.objects[key].form || object.form == "anyform")
            && (object.color == state.objects[key].color || object.color == null)
            && (object.size == state.objects[key].size  || object.size == null)) {
              if (doesObjectExist(state.holding, state.stacks, key)) {
                keys.push(key);
              }
            }
        }
      }
      return keys;
    }

    // Get the stack number.
    export function getStackNumber(stacks: string[][], searched_object: string) : number {
      for(var stack_number in stacks) {
        for(var object of stacks[stack_number]) {
          if (object == searched_object) {
            return +stack_number;
          }
        }
      }
      return null;
    }

    // Check world state with relations.
    export function doesObjectExist(holding: string, stacks: string[][], searched_object: string): Boolean {
	  if (holding == searched_object) return true;
      for(var stack of stacks) {
        for(var object of stack) {
          if (object == searched_object) {
            return true;
          }
        }
      }
      return false;
    }

    export function isInside(stack: string[], objectInside: string, objectBelow: string, state: WorldState) : Boolean {
      // Cannot be inside a table.

      if (getObjectForm(objectBelow, state) != "table") {
        var foundObjectBelow: Boolean = false;
        for(var object of stack) {
          if (foundObjectBelow) {
            return object == objectInside;
          }
          if (object == objectBelow) {
            foundObjectBelow = true;
          }
        }
      }
      return false;
    }

    function isMostLeft(stacks: string[][], _object: string) : Boolean {
      for(var stack of stacks) {
        for(var object of stack) {
          if (object == _object) {
            return true;
          }
        }
        break;
      }
      return false;
    }

    export function isRightOf(stacks: string[][], rightObject: string, secondObject: string) : Boolean {
      var rightObjectStackNr: number = -10;
      var secondObjectStackNr: number = -10;
      for(var stack_number in stacks) {
        for(var object of stacks[stack_number]) {
          if (object == rightObject) {
            rightObjectStackNr = +stack_number;
            break;
          } else if (object == secondObject) {
            secondObjectStackNr = +stack_number;
            break;
          }
        }
      }
      return secondObjectStackNr != -10 && rightObjectStackNr != -10 && rightObjectStackNr - secondObjectStackNr > 0;
    }

    export function isLeftOf(stacks: string[][], leftObject: string, secondObject: string) : Boolean {
      var leftObjectStackNr: number = -10;
      var secondObjectStackNr: number = -10;
      for(var stack_number in stacks) {
        for(var object of stacks[stack_number]) {
          if (object == leftObject) {
            leftObjectStackNr = +stack_number;
            break;
          } else if (object == secondObject) {
            secondObjectStackNr = +stack_number;
            break;
          }
        }
      }
      return secondObjectStackNr != -10 && leftObjectStackNr != -10 && secondObjectStackNr - leftObjectStackNr > 0;
    }

    export function isBeside(stacks: string[][], firstObject: string, secondObject: string) : Boolean {
      var firstObjectStackNr: number = -10;
      var secondObjectStackNr: number = -10;
      for(var stack_number in stacks) {
        for(var object of stacks[stack_number]) {
          if (object == firstObject) {
            firstObjectStackNr = +stack_number;
            break;
          } else if (object == secondObject) {
            secondObjectStackNr = +stack_number;
            break;
          }
        }
      }
      return Math.abs(secondObjectStackNr - firstObjectStackNr) == 1;
    }

    export function isAbove(stack: string[], objectAbove: string, objectUnder: string, state: WorldState) : Boolean {
      // Object above can't be floor
      if (getObjectForm(objectAbove, state) != "floor") {
        var foundObjectUnder: Boolean = false;
        for(var key in stack) {
          if (foundObjectUnder && stack[key] == objectAbove) {
            return true;
          }
          if (stack[key] == objectUnder) {
            foundObjectUnder = true;
          }

          // If we find a object that is on the floor
          if (objectUnder == "floor" && stack[key] == objectAbove) {
            return true;
          }
        }
      }
      return false;
    }

    export function isUnder(stack: string[], objectUnder: string, objectAbove: string, state: WorldState) : Boolean {
      // Object above can't be floor
      if (getObjectForm(objectAbove, state) != "floor" && getObjectForm(objectUnder, state) != "floor") {
        var foundObjectUnder: Boolean = false;
        for(var key in stack) {
          if (foundObjectUnder && stack[key] == objectAbove) {
            return true;
          }
          if (stack[key] == objectUnder) {
            foundObjectUnder = true;
          }
        }
      }
      return false;
    }

    export function isOnTop(stack: string[], objectOnTop: string, objectBelow: string, state: WorldState) : Boolean {
      // The floor can't be on top of anything
      if (getObjectForm(objectOnTop, state) != "floor") {
        var foundObjectBelow: Boolean = false;
        for(var key in stack) {
          if (foundObjectBelow) {
            return stack[key] == objectOnTop;
          }
          if (stack[key] == objectBelow) {
            foundObjectBelow = true;
          }
          // If we find a object that is on the floor
          if (objectBelow == "floor" && stack[key] == objectOnTop && key == "0") {
            return true;
          }
        }
      }
      return false;
    }
}

class ObjectRelations {
  constructor(public targetObject : string, public relation : string, public locationObject :string ) {
  }
}
class LocationRelation {
  constructor(public relation : string, public locationObject :string ) {
  }
}
