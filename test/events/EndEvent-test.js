'use strict';

const {Engine} = require('../../lib');
const {EventEmitter} = require('events');
const Lab = require('lab');
const testHelpers = require('../helpers/testHelpers');

const lab = exports.lab = Lab.script();
const {beforeEach, describe, it} = lab;
const {expect, fail} = Lab.assertions;

describe('EndEvent', () => {
  describe('behaviour', () => {
    const processXml = `
    <?xml version="1.0" encoding="UTF-8"?>
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <endEvent id="end">
          <extensionElements>
            <camunda:InputOutput>
              <camunda:inputParameter name="data">\${variables.statusCode}</camunda:inputParameter>
            </camunda:InputOutput>
          </extensionElements>
        </endEvent>
        <sequenceFlow id="flow1" sourceRef="start" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    beforeEach((done) => {
      testHelpers.getContext(processXml, {
        camunda: require('camunda-bpmn-moddle/resources/camunda')
      }, (err, c) => {
        if (err) return done(err);
        context = c;
        done();
      });
    });

    it('has inbound', (done) => {
      const event = context.getChildActivityById('end');
      expect(event.inbound).to.have.length(1);
      done();
    });

    it('supports io', (done) => {
      const event = context.getChildActivityById('end');
      expect(event.io).to.exist();
      done();
    });

    it('exection getInput() returns io input', (done) => {
      context.environment.assignVariables({statusCode: 200});

      const event = context.getChildActivityById('end');
      event.once('end', (activity, executionContext) => {
        expect(executionContext.getInput()).to.equal({
          data: 200
        });

        done();
      });

      event.activate();
      event.inbound[0].take();
    });
  });

  describe('engine', () => {
    describe('terminateEventDefinition', () => {
      const source = `
      <?xml version="1.0" encoding="UTF-8"?>
        <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="theProcess" isExecutable="true">
          <startEvent id="theStart" />
          <endEvent id="fatal">
            <terminateEventDefinition />
          </endEvent>
          <endEvent id="theEnd1" />
          <endEvent id="theEnd2" />
          <endEvent id="theEnd3" />
          <sequenceFlow id="flow1" sourceRef="theStart" targetRef="fatal" />
          <sequenceFlow id="flow2" sourceRef="theStart" targetRef="theEnd1" />
          <sequenceFlow id="flow3" sourceRef="theStart" targetRef="theEnd2" />
          <sequenceFlow id="flow4" sourceRef="theStart" targetRef="theEnd3" />
        </process>
      </definitions>`;

      let definition;
      lab.before((done) => {
        const engine = new Engine({
          source
        });
        engine.getDefinition((err, def) => {
          if (err) return done(err);
          definition = def;
          done();
        });
      });

      it('should have inbound sequence flows', (done) => {
        const element = definition.getChildActivityById('fatal');
        expect(element).to.include('inbound');
        expect(element.inbound).to.have.length(1);
        done();
      });

      it('and have property isTermation flag true', (done) => {
        const element = definition.getChildActivityById('fatal');
        expect(element.terminate).to.be.true();
        done();
      });

      it('should terminate process', (done) => {
        const engine = new Engine({
          source
        });
        const listener = new EventEmitter();
        listener.once('end-theEnd1', (activityApi) => {
          fail(new Error(`${activityApi.id} should have been terminated`));
        });

        engine.execute({
          listener: listener
        }, (err, instance) => {
          if (err) return done(err);

          instance.once('end', () => {
            expect(instance.isEnded).to.equal(true);
            testHelpers.expectNoLingeringListenersOnDefinition(instance);
            done();
          });
        });
      });
    });
  });
});
